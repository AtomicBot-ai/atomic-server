/**
 * Durable downloads of Foundry Local variants (design D9): a reviewed plan by its digest, then a job
 * under the caller's request id. The job resolves the variant's short-lived container link, downloads
 * the missing files into `<data>/foundry-local/models/<variant>/` (each with a resume key that outlives
 * the link), and on an expired link (HTTP 403) resolves again and continues — at most three times. Then
 * it repairs `chat_template.jinja` for tools and writes `model.yml` last, with the `foundry_local` block
 * the core loads the variant by. A job running when the server stopped reads as `interrupted`.
 */

import { serializeModelYml } from '@atomic-chat/core/models'
import type { FoundryModelJob, FoundryModelPlan, WorkspaceInput } from '../../contract/index.js'
import type { Downloader, ProxyConfig } from '../../downloads/index.js'
import { variantLabel } from '../../workspace-view/index.js'
import { nodeStoreFiles, underRoot } from '../managed/managed-model-plan.js'
import { SetupJournal } from '../setup-journal.js'
import { fetchFoundryLocalList } from './foundry-list.js'
import type { FoundryPlanDeps } from './foundry-model-plan.js'
import { foundryModelPlan, resolveVariant } from './foundry-model-plan.js'
import { repairTemplateFile } from './foundry-template.js'
import { captureFailure, type ErrorSink } from '../../telemetry/index.js'

const MAX_RELINKS = 3
export function foundryModelYml(plan: FoundryModelPlan): string {
  return serializeModelYml({
    model_path: `foundry-local/models/${plan.variant_id}`,
    name: `${plan.name} (${variantLabel(plan)})`,
    size_bytes: plan.files.reduce((a, f) => a + f.size, 0),
    foundry_local: {
      model_id: plan.model_id,
      variant_id: plan.variant_id,
      execution_provider: plan.execution_provider,
      device: plan.device,
      asset_id: plan.asset_id,
      asset_version: plan.version,
      ...plan.record,
    },
  })
}

export interface FoundryModelSetupsDeps extends Omit<FoundryPlanDeps, 'files'> {
  errors?: ErrorSink
  directory: string
  downloader: Pick<Downloader, 'download' | 'cancel'> & Partial<Pick<Downloader, 'snapshot'>>
  files?: FoundryPlanDeps['files']
  proxy?: ProxyConfig | null | undefined
}

export class FoundryModelSetups {
  readonly directory: string
  private readonly journal: SetupJournal<FoundryModelPlan, FoundryModelJob>
  constructor(private readonly d: FoundryModelSetupsDeps) {
    this.directory = d.directory
    this.journal = new SetupJournal({
      directory: d.directory,
      kind: 'foundry-model',
      policy: {
        awaitWorkerOnCancel: true,
        recordTransferred: true,
        awaitCancelledBeforeInstall: false,
      },
      reviewFirst: 'Review the download with foundry.plan first.',
      noSuch: 'No such Foundry Local download.',
      hasPlan: (plan) => !!plan.files,
      downloader: d.downloader,
      run: (job, worker) => this.run(job, worker),
    })
  }

  async plan(input: { model: string; variant?: string; device?: string }): Promise<FoundryModelPlan> {
    const plan = await foundryModelPlan({ ...this.d, files: this.d.files ?? nodeStoreFiles }, input)
    return this.journal.record(plan)
  }

  list(): Promise<FoundryModelJob[]> {
    return this.journal.list()
  }

  install(input: WorkspaceInput): Promise<FoundryModelJob> {
    return this.journal.install(input)
  }

  cancel(id: string): Promise<FoundryModelJob> {
    return this.journal.cancel(id)
  }

  remove(id: string, cleanup: (job: FoundryModelJob) => Promise<void>) {
    return this.journal.remove(id, cleanup)
  }

  private async run(job: FoundryModelJob, worker: { cancelled: boolean }): Promise<void> {
    const { plan } = job
    const files = this.d.files ?? nodeStoreFiles
    try {
      await this.journal.step(job, worker, 'downloading')
      const sizes = await Promise.all(plan.files.map((f) => files.size(underRoot(plan.dir, f.path))))
      const missing = plan.files.filter((f, i) => sizes[i] !== f.size)
      if (missing.length) {
        const { list } = await fetchFoundryLocalList({ ...this.d.list, fetch: this.d.fetch })
        let link = await resolveVariant(list, plan.asset_id, this.d.fetch)
        job.relinks = 0
        for (;;) {
          const items = missing.map((f) => ({
            url: `${link.container}/${plan.prefix ? `${plan.prefix}/` : ''}${f.path}?${link.query}`,
            save_path: underRoot(plan.dir, f.path),
            size: f.size,
            ...(f.sha256 ? { sha256: f.sha256 } : {}),
            resume_key: `foundry-local/${plan.variant_id}/${f.path}`,
            ...(this.d.proxy ? { proxy: this.d.proxy } : {}),
          }))
          try {
            if (worker.cancelled) return void (await this.journal.step(job, worker, 'cancelled'))
            await this.d.downloader.download(job.id, items, { resume: true })
            break
          } catch (error) {
            // The SAS link lives a few hours: a fresh one names the same files; the resume keys keep the bytes.
            if (worker.cancelled || !/HTTP status 403\b/.test(String(error)) || job.relinks >= MAX_RELINKS)
              throw error
            job.relinks += 1
            link = await resolveVariant(list, plan.asset_id, this.d.fetch)
          }
        }
      }
      if (worker.cancelled) return void (await this.journal.step(job, worker, 'cancelled'))
      await this.journal.step(job, worker, 'verifying')
      await repairTemplateFile(plan.dir)
      // Last: this file is what turns the folder into a model for the core.
      // core-boundary: model.yml — atc downloads Foundry Local variants and writes it last with the core's serializeModelYml (ADR 2026-10-20-foundry-local-models-in-atc)
      await files.writeAtomic(underRoot(plan.dir, 'model.yml'), foundryModelYml(plan))
      await this.journal.step(job, worker, 'ready')
    } catch (error) {
      const cancelled = worker.cancelled || String(error).includes('Download cancelled')
      if (!cancelled)
        captureFailure(this.d.errors, error, {
          component: 'foundry-setup',
          operation: `foundry.${job.stage}`,
        })
      await this.journal
        .step(job, worker, cancelled ? 'cancelled' : 'failed', cancelled ? undefined : error)
        .catch((error: unknown) =>
          captureFailure(this.d.errors, error, { component: 'foundry-setup', operation: 'foundry.persist' })
        )
    }
  }
}
