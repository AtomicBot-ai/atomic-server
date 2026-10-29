/**
 * Durable downloads of LiteRT-LM variants (spec `litert-lm-models`, "Файл варианта качает клиент с
 * проверкой"): a reviewed plan by its digest, then a job under the caller's request id. The job downloads
 * the variant's file from `<hub>/<repo>/resolve/<commit>/<path>` into `<data>/litert-lm/models/<variant>/`
 * with resume and its sha256 checked, `HF_TOKEN` going to the Hub's origin alone; then the core checks the
 * file by its path, and `model.yml` is written last with the `litert_lm` block the core loads it by. A
 * refused gated download and a file the core refuses leave no folder behind; a job running when the
 * server stopped reads as `interrupted`, and the next install with its request id continues it.
 */

import { rm } from 'node:fs/promises'
import type { LiteRtLmCheckResult } from '@atomic-chat/core/contracts'
import { serializeModelYml } from '@atomic-chat/core/models'
import type { LiteRtModelJob, LiteRtModelPlan, WorkspaceInput } from '../../contract/index.js'
import type { Downloader, ProxyConfig } from '../../downloads/index.js'
import { AtcError } from '../../errors/index.js'
import { liteRtVariantLabel } from '../../workspace-view/index.js'
import { HF_HUB, resolveUrl } from '../models/hf-revision.js'
import { hubAuthorized } from '../models/hub-fetch.js'
import { nodeStoreFiles, underRoot } from '../managed/managed-model-plan.js'
import { SetupJournal } from '../setup-journal.js'
import { liteRtFileName, liteRtModelPlan } from './litert-model-plan.js'
import type { LiteRtPlanDeps } from './litert-model-plan.js'
import { captureFailure, type ErrorSink } from '../../telemetry/index.js'

const KEPT = ['ok', 'accelerator-not-prepared']

/** `model.yml` of a downloaded variant; a Hugging Face model's abilities come from the core's check. */
export function liteRtModelYml(plan: LiteRtModelPlan, check: LiteRtLmCheckResult): string {
  const meta = check.metadata
  const record =
    plan.origin === 'huggingface' && meta
      ? {
          ...(meta.max_context_tokens ? { context_length: meta.max_context_tokens } : {}),
          tools: meta.function_calling,
          reasoning: meta.thinking,
          vision: meta.modalities.includes('vision'),
        }
      : plan.record
  const name = liteRtFileName(plan.file.path)
  return serializeModelYml({
    model_path: `litert-lm/models/${plan.variant_id}/${name}`,
    name: `${plan.name} (${liteRtVariantLabel(plan)})`,
    size_bytes: plan.file.size,
    litert_lm: {
      model_id: plan.model_id,
      variant_id: plan.variant_id,
      backend: plan.backend,
      ...(plan.npu ? { npu: plan.npu } : {}),
      repo: plan.repo,
      revision: plan.revision,
      file: plan.file.path,
      ...record,
      source: plan.origin === 'huggingface' ? 'huggingface' : 'curated',
    },
  })
}

export interface LiteRtModelSetupsDeps extends Omit<LiteRtPlanDeps, 'files'> {
  errors?: ErrorSink
  directory: string
  downloader: Pick<Downloader, 'download' | 'cancel'>
  files?: LiteRtPlanDeps['files']
  proxy?: ProxyConfig | null | undefined
}

export class LiteRtModelSetups {
  private readonly journal: SetupJournal<LiteRtModelPlan, LiteRtModelJob>
  constructor(private readonly d: LiteRtModelSetupsDeps) {
    this.journal = new SetupJournal({
      directory: d.directory,
      kind: 'litert-model',
      policy: {
        awaitWorkerOnCancel: false,
        recordTransferred: false,
        awaitCancelledBeforeInstall: true,
      },
      reviewFirst: 'Review the download with litert.plan first.',
      noSuch: 'No such LiteRT-LM download.',
      hasPlan: (plan) => !!plan.file,
      downloader: d.downloader,
      run: (job, worker) => this.run(job, worker),
    })
  }

  async plan(input: { model: string; variant?: string; backend?: string }): Promise<LiteRtModelPlan> {
    const plan = await liteRtModelPlan({ ...this.d, files: this.d.files ?? nodeStoreFiles }, input)
    return this.journal.record(plan)
  }

  list(): Promise<LiteRtModelJob[]> {
    return this.journal.list()
  }

  install(input: WorkspaceInput): Promise<LiteRtModelJob> {
    return this.journal.install(input)
  }

  cancel(id: string): Promise<LiteRtModelJob> {
    return this.journal.cancel(id)
  }

  /** Stops the job, waits for its worker, then lets `cleanup` discard its files before the record goes. */
  remove(id: string, cleanup: (job: LiteRtModelJob) => Promise<void>) {
    return this.journal.remove(id, cleanup)
  }

  private async download(job: LiteRtModelJob): Promise<void> {
    const { plan } = job
    const item = {
      url: resolveUrl(plan.repo, plan.revision, plan.file.path, this.d.hub),
      save_path: underRoot(plan.dir, liteRtFileName(plan.file.path)),
      size: plan.file.size,
      sha256: plan.file.sha256,
      ...(this.d.proxy ? { proxy: this.d.proxy } : {}),
    }
    try {
      await this.d.downloader.download(job.id, [item], {
        resume: true,
        wrapFetch: (base) => hubAuthorized(base, this.d.hub, this.d.token),
      })
    } catch (error) {
      if (!/HTTP status 40[13]\b/.test(String(error))) throw error
      // A refusal is the person's to fix on Hugging Face: nothing of the variant stays.
      await rm(plan.dir, { recursive: true, force: true })
      throw new AtcError(
        'ATC_USAGE',
        `Hugging Face refused ${plan.repo}: accept its terms at ${HF_HUB}/${plan.repo}, then set HF_TOKEN in the server's environment and restart it.`
      )
    }
  }

  private async run(job: LiteRtModelJob, worker: { cancelled: boolean }): Promise<void> {
    const { plan } = job
    const files = this.d.files ?? nodeStoreFiles
    try {
      await this.journal.step(job, worker, 'downloading')
      if (!plan.present) await this.download(job)
      if (worker.cancelled) return void (await this.journal.step(job, worker, 'cancelled'))
      await this.journal.step(job, worker, 'verifying')
      const check = await this.d.link.request<LiteRtLmCheckResult>('POST', '/models/litert-lm/check', {
        path: underRoot(plan.dir, liteRtFileName(plan.file.path)),
        backend: plan.backend,
        ...(plan.npu ? { npu: plan.npu } : {}),
      })
      if (!KEPT.includes(check.verdict)) {
        await rm(plan.dir, { recursive: true, force: true })
        throw new Error(`The core refused ${plan.variant_id}: ${check.reason ?? check.verdict}`)
      }
      // Last: this file is what turns the folder into a model for the core.
      // core-boundary: model.yml — atc downloads LiteRT-LM variants and writes it last with the core's serializeModelYml (ADR 2026-10-22-litert-lm-in-atc)
      await files.writeAtomic(underRoot(plan.dir, 'model.yml'), liteRtModelYml(plan, check))
      await this.journal.step(job, worker, 'ready')
    } catch (error) {
      const cancelled = worker.cancelled || String(error).includes('Download cancelled')
      if (!cancelled)
        captureFailure(this.d.errors, error, { component: 'litert-setup', operation: `litert.${job.stage}` })
      await this.journal
        .step(job, worker, cancelled ? 'cancelled' : 'failed', cancelled ? undefined : error)
        .catch((error: unknown) =>
          captureFailure(this.d.errors, error, { component: 'litert-setup', operation: 'litert.persist' })
        )
    }
  }
}
