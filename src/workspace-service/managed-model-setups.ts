/**
 * Durable downloads into the managed engines' shared store (design D6, after `ArtifactService`): a
 * reviewed plan by its digest, then a job under the caller's request id that downloads the missing
 * files with the server's downloader (the store's root as an extra allowed root), writes `model.yml`
 * last — only once every file is verified — and checks that the core then lists the model. A job that
 * was running when the server stopped reads as `interrupted`; the same request id continues it.
 */

import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ManagedModelJob, ManagedModelPlan, WorkspaceInput } from '../contract/index.js'
import type { Downloader, ProxyConfig } from '../downloads/index.js'
import { AtcError } from '../errors/index.js'
import { readDocument, writeDocument } from '../terminal-data/index.js'
import { resolveUrl } from './hf-revision.js'
import { managedModelPlan, underRoot } from './managed-model-plan.js'
import type { StoreFiles } from './managed-model-plan.js'
import type { ManagedModelDeps } from './managed-models.js'
import { hubOf } from './managed-models.js'
import { SerialWork } from './serial.js'
import { modelIdPath, segment } from './validation.js'
import { listJobs } from './managed-jobs.js'

export type { StoreFiles } from './managed-model-plan.js'

export interface ManagedModelSetupsDeps extends ManagedModelDeps {
  /** `<atc>/managed-model-setups`: one record per plan digest and per request id. */
  directory: string
  downloader: Pick<Downloader, 'download' | 'cancel'> & Partial<Pick<Downloader, 'snapshot'>>
  files?: StoreFiles
  proxy?: ProxyConfig | null | undefined
}

export const nodeStoreFiles: StoreFiles = {
  size: async (path) => {
    const s = await stat(path).catch(() => null)
    return s?.isFile() ? s.size : null
  },
  readText: (path) => readFile(path, 'utf8').catch(() => undefined),
  writeAtomic: async (path, text) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(`${path}.tmp`, text)
    await rename(`${path}.tmp`, path)
  },
}

const ACTIVE = ['queued', 'downloading', 'verifying']

export class ManagedModelSetups {
  private readonly running = new Map<string, { cancelled: boolean; done: Promise<void> }>()
  private readonly mutations = new SerialWork()
  private readonly files: StoreFiles
  readonly directory: string
  constructor(private readonly d: ManagedModelSetupsDeps) {
    this.files = d.files ?? nodeStoreFiles
    this.directory = d.directory
  }

  private path(id: string) {
    if (!/^[\w-]{1,120}$/.test(id))
      throw new AtcError('ATC_USAGE', 'Use a request ID of letters, numbers, underscores or hyphens.')
    return join(this.directory, `${id}.json`)
  }

  async plan(input: { repository: string; revision?: string; engine: string }): Promise<ManagedModelPlan> {
    const plan = await managedModelPlan({ ...this.d, files: this.files }, input)
    await writeDocument(this.path(plan.digest), plan)
    return plan
  }

  /** Every job, a running one without its worker (the server restarted) as `interrupted`. */
  list(): Promise<ManagedModelJob[]> {
    return listJobs<ManagedModelJob>(this.directory, 'managed-model', (job) =>
      ACTIVE.includes(job.stage) && !this.running.has(job.id) ? { ...job, stage: 'interrupted' } : job
    )
  }

  install(input: WorkspaceInput): Promise<ManagedModelJob> {
    const id = String(input['request_id'])
    const digest = String(input['plan_digest'])
    return this.mutations.run(id, async () => {
      const existing = await readDocument<ManagedModelJob | null>(this.path(id), null)
      if (existing) {
        if (existing.plan.digest !== digest)
          throw new AtcError('ATC_USAGE', 'This request ID belongs to another plan.')
        return this.start(existing)
      }
      const plan = await readDocument<ManagedModelPlan | null>(this.path(digest), null)
      if (!plan?.files) throw new AtcError('ATC_USAGE', 'Review the download with managed.plan first.')
      if (plan.blockers.length) throw new AtcError('ATC_USAGE', plan.blockers.join(' '))
      return this.start({ id, kind: 'managed-model', plan, stage: 'queued', updated_at: Date.now() })
    })
  }

  async cancel(id: string): Promise<ManagedModelJob> {
    const worker = this.running.get(id)
    const transferred = this.d.downloader.snapshot?.().find((transfer) => transfer.taskId === id)?.transferred
    if (worker) worker.cancelled = true
    this.d.downloader.cancel(id)
    await worker?.done
    return this.mutations.run(id, async () => {
      const job = await readDocument<ManagedModelJob | null>(this.path(id), null)
      if (!job?.plan) throw new AtcError('ATC_USAGE', 'No such model download.')
      if (transferred !== undefined) Object.assign(job, { transferred })
      if (job.stage !== 'ready') await this.write(job, 'cancelled')
      return job
    })
  }

  async remove(id: string, cleanup: (job: ManagedModelJob) => Promise<void>) {
    const worker = this.running.get(id)
    await this.cancel(id)
    await worker?.done
    return this.mutations.run(id, async () => {
      if (this.running.has(id)) throw new AtcError('ATC_USAGE', 'Pause this download before removing it.')
      const job = await readDocument<ManagedModelJob | null>(this.path(id), null)
      if (!job?.plan) throw new AtcError('ATC_USAGE', 'No such download.')
      await cleanup(job)
      await rm(this.path(id), { force: true })
      return { removed: true, id }
    })
  }

  private async write(job: ManagedModelJob, stage: ManagedModelJob['stage'], error?: unknown) {
    job.stage = stage
    job.updated_at = Date.now()
    if (error !== undefined) job.error = error instanceof Error ? error.message : String(error)
    else delete job.error
    await writeDocument(this.path(job.id), job)
  }

  private async start(job: ManagedModelJob): Promise<ManagedModelJob> {
    if (job.stage === 'ready' || this.running.has(job.id)) return job
    const worker = { cancelled: false, done: Promise.resolve() }
    this.running.set(job.id, worker)
    await this.write(job, 'queued')
    worker.done = this.run(job, worker).finally(() => {
      if (this.running.get(job.id) === worker) this.running.delete(job.id)
    })
    return { ...job }
  }

  /** One step of the job, unless it was cancelled meanwhile; under the job's lock. */
  private step(
    job: ManagedModelJob,
    worker: { cancelled: boolean },
    stage: ManagedModelJob['stage'],
    error?: unknown
  ) {
    return this.mutations.run(job.id, () => this.write(job, worker.cancelled ? 'cancelled' : stage, error))
  }

  private async run(job: ManagedModelJob, worker: { cancelled: boolean }): Promise<void> {
    const { plan } = job
    const token = this.d.env?.['HF_TOKEN']
    try {
      if (!plan.present) {
        await this.step(job, worker, 'downloading')
        if (worker.cancelled) return void (await this.step(job, worker, 'cancelled'))
        const items = plan.files.map((f) => ({
          url: resolveUrl(plan.repository, plan.revision, f.path, hubOf(this.d.env)),
          save_path: underRoot(plan.root, plan.repository, f.path),
          size: f.size,
          sha256: f.sha256,
          ...(this.d.proxy ? { proxy: this.d.proxy } : {}),
        }))
        await this.d.downloader.download(job.id, items, {
          resume: true,
          allowedRoots: [plan.root],
          ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        })
        if (worker.cancelled) return void (await this.step(job, worker, 'cancelled'))
        await this.step(job, worker, 'verifying')
        // Last: this file is what turns the folder into a model for the core (JSON is YAML to its parser).
        const yml = {
          repository: plan.repository,
          revision: plan.revision,
          architectures: plan.architectures,
          files: plan.files,
        }
        await this.files.writeAtomic(
          // core-boundary: model.yml — atc downloads checkpoints into the core's store and writes it last (ADR 2026-10-20-download-managed-models-in-atc)
          underRoot(plan.root, plan.repository, 'model.yml'),
          `${JSON.stringify(yml, null, 2)}\n`
        )
      }
      await this.d.link
        .request('GET', `/models/${segment(plan.engine)}/${modelIdPath(plan.repository)}/capabilities`)
        .catch((error: unknown) => {
          throw new Error(
            `The core does not list ${plan.repository} after model.yml was written; its files stay in ${plan.root} (${error instanceof Error ? error.message : String(error)}).`
          )
        })
      await this.step(job, worker, 'ready')
    } catch (error) {
      const cancelled = worker.cancelled || String(error).includes('Download cancelled')
      await this.step(job, worker, cancelled ? 'cancelled' : 'failed', cancelled ? undefined : error).catch(
        () => {}
      )
    }
  }
}
