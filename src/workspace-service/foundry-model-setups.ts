import { rm } from 'node:fs/promises'
/**
 * Durable downloads of Foundry Local variants (design D9): a reviewed plan by its digest, then a job
 * under the caller's request id. The job resolves the variant's short-lived container link, downloads
 * the missing files into `<data>/foundry-local/models/<variant>/` (each with a resume key that outlives
 * the link), and on an expired link (HTTP 403) resolves again and continues — at most three times. Then
 * it repairs `chat_template.jinja` for tools and writes `model.yml` last, with the `foundry_local` block
 * the core loads the variant by. A job running when the server stopped reads as `interrupted`.
 */

import { serializeModelYml } from '@atomic-chat/core/models'
import { join } from 'node:path'
import type { FoundryModelJob, FoundryModelPlan, WorkspaceInput } from '../contract/index.js'
import type { Downloader, ProxyConfig } from '../downloads/index.js'
import { AtcError } from '../errors/index.js'
import { readDocument, writeDocument } from '../terminal-data/index.js'
import { fetchFoundryLocalList } from './foundry-list.js'
import type { FoundryPlanDeps } from './foundry-model-plan.js'
import { foundryModelPlan, resolveVariant } from './foundry-model-plan.js'
import { repairTemplateFile } from './foundry-template.js'
import { listJobs } from './managed-jobs.js'
import { nodeStoreFiles } from './managed-model-setups.js'
import { underRoot } from './managed-model-plan.js'
import { SerialWork } from './serial.js'
import { variantLabel } from '../workspace-view/index.js'

const MAX_RELINKS = 3
const ACTIVE = ['queued', 'downloading', 'verifying']
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
  directory: string
  downloader: Pick<Downloader, 'download' | 'cancel'> & Partial<Pick<Downloader, 'snapshot'>>
  files?: FoundryPlanDeps['files']
  proxy?: ProxyConfig | null | undefined
}

export class FoundryModelSetups {
  private readonly running = new Map<string, { cancelled: boolean; done: Promise<void> }>()
  private readonly mutations = new SerialWork()
  readonly directory: string
  constructor(private readonly d: FoundryModelSetupsDeps) {
    this.directory = d.directory
  }

  private path(id: string) {
    if (!/^[\w-]{1,120}$/.test(id))
      throw new AtcError('ATC_USAGE', 'Use a request ID of letters, numbers, underscores or hyphens.')
    return join(this.directory, `${id}.json`)
  }

  async plan(input: { model: string; variant?: string; device?: string }): Promise<FoundryModelPlan> {
    const plan = await foundryModelPlan({ ...this.d, files: this.d.files ?? nodeStoreFiles }, input)
    await writeDocument(this.path(plan.digest), plan)
    return plan
  }

  list(): Promise<FoundryModelJob[]> {
    return listJobs<FoundryModelJob>(this.directory, 'foundry-model', (job) =>
      ACTIVE.includes(job.stage) && !this.running.has(job.id) ? { ...job, stage: 'interrupted' } : job
    )
  }

  install(input: WorkspaceInput): Promise<FoundryModelJob> {
    const id = String(input['request_id'])
    const digest = String(input['plan_digest'])
    return this.mutations.run(id, async () => {
      const existing = await readDocument<FoundryModelJob | null>(this.path(id), null)
      if (existing) {
        if (existing.plan.digest !== digest)
          throw new AtcError('ATC_USAGE', 'This request ID belongs to another plan.')
        return this.start(existing)
      }
      const plan = await readDocument<FoundryModelPlan | null>(this.path(digest), null)
      if (!plan?.files) throw new AtcError('ATC_USAGE', 'Review the download with foundry.plan first.')
      if (plan.blockers.length) throw new AtcError('ATC_USAGE', plan.blockers.join(' '))
      return this.start({ id, kind: 'foundry-model', plan, stage: 'queued', updated_at: Date.now() })
    })
  }

  async cancel(id: string): Promise<FoundryModelJob> {
    const worker = this.running.get(id)
    const transferred = this.d.downloader.snapshot?.().find((transfer) => transfer.taskId === id)?.transferred
    if (worker) worker.cancelled = true
    this.d.downloader.cancel(id)
    await worker?.done
    return this.mutations.run(id, async () => {
      const job = await readDocument<FoundryModelJob | null>(this.path(id), null)
      if (!job?.plan) throw new AtcError('ATC_USAGE', 'No such Foundry Local download.')
      if (transferred !== undefined) Object.assign(job, { transferred })
      if (job.stage !== 'ready') await this.write(job, 'cancelled')
      return job
    })
  }

  async remove(id: string, cleanup: (job: FoundryModelJob) => Promise<void>) {
    const worker = this.running.get(id)
    await this.cancel(id)
    await worker?.done
    return this.mutations.run(id, async () => {
      if (this.running.has(id)) throw new AtcError('ATC_USAGE', 'Pause this download before removing it.')
      const job = await readDocument<FoundryModelJob | null>(this.path(id), null)
      if (!job?.plan) throw new AtcError('ATC_USAGE', 'No such download.')
      await cleanup(job)
      await rm(this.path(id), { force: true })
      return { removed: true, id }
    })
  }

  private async write(job: FoundryModelJob, stage: FoundryModelJob['stage'], error?: unknown) {
    job.stage = stage
    job.updated_at = Date.now()
    if (error !== undefined) job.error = error instanceof Error ? error.message : String(error)
    else delete job.error
    await writeDocument(this.path(job.id), job)
  }

  private async start(job: FoundryModelJob): Promise<FoundryModelJob> {
    if (job.stage === 'ready' || this.running.has(job.id)) return job
    const worker = { cancelled: false, done: Promise.resolve() }
    this.running.set(job.id, worker)
    await this.write(job, 'queued')
    worker.done = this.run(job, worker).finally(() => {
      if (this.running.get(job.id) === worker) this.running.delete(job.id)
    })
    return { ...job }
  }

  private step(
    job: FoundryModelJob,
    worker: { cancelled: boolean },
    stage: FoundryModelJob['stage'],
    error?: unknown
  ) {
    return this.mutations.run(job.id, () => this.write(job, worker.cancelled ? 'cancelled' : stage, error))
  }

  private async run(job: FoundryModelJob, worker: { cancelled: boolean }): Promise<void> {
    const { plan } = job
    const files = this.d.files ?? nodeStoreFiles
    try {
      await this.step(job, worker, 'downloading')
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
            if (worker.cancelled) return void (await this.step(job, worker, 'cancelled'))
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
      if (worker.cancelled) return void (await this.step(job, worker, 'cancelled'))
      await this.step(job, worker, 'verifying')
      await repairTemplateFile(plan.dir)
      // Last: this file is what turns the folder into a model for the core.
      // core-boundary: model.yml — atc downloads Foundry Local variants and writes it last with the core's serializeModelYml (ADR 2026-10-20-foundry-local-models-in-atc)
      await files.writeAtomic(underRoot(plan.dir, 'model.yml'), foundryModelYml(plan))
      await this.step(job, worker, 'ready')
    } catch (error) {
      const cancelled = worker.cancelled || String(error).includes('Download cancelled')
      await this.step(job, worker, cancelled ? 'cancelled' : 'failed', cancelled ? undefined : error).catch(
        () => {}
      )
    }
  }
}
