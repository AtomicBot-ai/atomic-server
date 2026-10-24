import { join } from 'node:path'
import { readdir, rm } from 'node:fs/promises'
import { ModelRegistry } from '@atomic-chat/core/models'
import { Downloader } from '../downloads/index.js'
import type { WorkspaceInput } from '../contract/index.js'
import { readDocument, writeDocument } from '../terminal-data/index.js'
import { AtcError } from '../errors/index.js'
import { ensureArtifactEngine } from './engine-install.js'
import type { WorkspaceServiceOptions } from './service.js'
import type { WorkspaceCatalog, CatalogCategory } from './catalog.js'
import { artifactPlan, destinationOf } from './artifact-plan.js'
import type { ArtifactJob, ArtifactPlan } from './artifact-plan.js'
import { migrateMediaFolders } from './media-migration.js'
import { mlxPlan } from './mlx-plan.js'
import { SerialWork } from './serial.js'
import { downloadProxy } from './download-proxy.js'
interface Worker {
  cancelled: boolean
  done: Promise<void>
}
export class ArtifactService {
  private downloader: Downloader
  private running = new Map<string, Worker>()
  private mutations = new SerialWork()
  private destinations = new SerialWork()
  private directory: string
  constructor(
    private options: WorkspaceServiceOptions,
    private catalog: WorkspaceCatalog,
    private request: typeof fetch,
    downloader?: Downloader,
    private ensureEngine?: (engine: string, taskId: string) => Promise<void>
  ) {
    this.directory = join(options.paths.atcDir, 'media-installations')
    this.downloader =
      downloader ??
      new Downloader({
        dataFolder: options.paths.dataFolder,
        platform: options.platform ?? process.platform,
        fetch: request,
        availableSpace: async (path) => (await options.link.disk.available(path)) ?? undefined,
      })
  }
  /** Move what an earlier atc downloaded to where the core looks for it; before any job runs. */
  migrate(): Promise<{ kept: string[] }> {
    return migrateMediaFolders(this.options.paths.dataFolder, this.directory)
  }
  private path(id: string) {
    if (!/^[\w-]{1,120}$/.test(id))
      throw new AtcError('ATC_USAGE', 'Use a request ID containing letters, numbers, underscores or hyphens.')
    return join(this.directory, `${id}.json`)
  }
  async plan(input: WorkspaceInput) {
    const category = input['category'] as CatalogCategory,
      { rows } = await this.catalog.list(category),
      row = rows.find((r) => r.id === input['model_id'])
    if (!row) throw new AtcError('ATC_USAGE', 'Choose a model from the current catalog.')
    const plan =
      category === 'text'
        ? await mlxPlan(row, this.options.paths.dataFolder, this.request)
        : artifactPlan(row, this.options.paths.dataFolder, input['quant'] as string | undefined)
    const free = await this.options.link.disk.available()
    await writeDocument(this.path(plan.digest), plan)
    return {
      ...plan,
      free_bytes: free,
      blockers:
        free !== null && free < plan.total_download_bytes + 1024 ** 3 ? ['Not enough free disk space.'] : [],
    }
  }
  async list(): Promise<ArtifactJob[]> {
    const names = await readdir(this.directory).catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return []
      throw e
    })
    const docs = await Promise.all(
      names
        .filter((n) => /^[\w-]+\.json$/.test(n))
        .map((n) => readDocument<ArtifactJob | null>(join(this.directory, n), null))
    )
    return docs
      .filter((d): d is ArtifactJob => !!d?.plan)
      .map((d) => ({
        ...d,
        stage:
          ['queued', 'downloading', 'installing_engine'].includes(d.stage) && !this.running.has(d.id)
            ? 'interrupted'
            : d.stage,
      }))
  }
  install(input: WorkspaceInput): Promise<ArtifactJob> {
    const id = String(input['request_id'])
    this.path(id)
    return this.mutations.run(id, async () => {
      const existing = await readDocument<ArtifactJob | null>(this.path(id), null),
        digest = String(input['plan_digest'])
      if (existing) {
        if (existing.plan.digest !== digest)
          throw new AtcError('ATC_USAGE', 'This request ID belongs to another plan.')
        return this.resumeHeld(existing)
      }
      const plan = await readDocument<ArtifactPlan | null>(this.path(digest), null)
      if (!plan || !Array.isArray(plan.files))
        throw new AtcError('ATC_USAGE', 'Review the media installation before applying it.')
      const free = await this.options.link.disk.available()
      if (free !== null && free < plan.total_download_bytes + 1024 ** 3)
        throw new AtcError('ATC_USAGE', 'Free disk space before downloading this model.')
      return this.resumeHeld({ id, plan, stage: 'queued', updated_at: Date.now() })
    })
  }
  async resume(id: string): Promise<ArtifactJob> {
    // A resumed run must never overlap the cancelled worker still releasing its files.
    const previous = this.running.get(id)
    if (previous?.cancelled) await previous.done
    return this.mutations.run(id, async () => this.resumeHeld(await this.get(id)))
  }
  private async resumeHeld(job: ArtifactJob): Promise<ArtifactJob> {
    if (job.stage === 'ready' || this.running.has(job.id)) return job
    let finished!: () => void
    const worker: Worker = {
      cancelled: false,
      done: new Promise<void>((resolve) => {
        finished = resolve
      }),
    }
    this.running.set(job.id, worker)
    job.stage = 'queued'
    delete job.error
    job.updated_at = Date.now()
    try {
      await writeDocument(this.path(job.id), job)
    } catch (error) {
      this.running.delete(job.id)
      finished()
      throw error
    }
    void this.destinations
      .run(destinationOf(job.plan), () => this.run(job, worker))
      .catch(() => {
        /* Failed persistence remains recoverable as an interrupted job. */
      })
      .finally(() => {
        if (this.running.get(job.id) === worker) this.running.delete(job.id)
        finished()
      })
    return job
  }
  private async persist(job: ArtifactJob, worker: Worker, stage: ArtifactJob['stage'], error?: unknown) {
    await this.mutations.run(job.id, async () => {
      job.stage = worker.cancelled ? 'cancelled' : stage
      job.updated_at = Date.now()
      if (error && !worker.cancelled) job.error = error instanceof Error ? error.message : String(error)
      await writeDocument(this.path(job.id), job)
    })
  }
  private async run(job: ArtifactJob, worker: Worker): Promise<void> {
    try {
      if (worker.cancelled) {
        await this.persist(job, worker, 'cancelled')
        return
      }
      await this.persist(job, worker, 'installing_engine')
      if (worker.cancelled) return
      if (this.ensureEngine) await this.ensureEngine(job.plan.engine, `media-engine-${job.id}`)
      else await ensureArtifactEngine(this.options.link, job.plan.engine, `media-engine-${job.id}`)
      if (worker.cancelled) {
        await this.persist(job, worker, 'cancelled')
        return
      }
      await this.persist(job, worker, 'downloading')
      if (worker.cancelled) return
      const proxy = downloadProxy(this.options.config)
      await this.downloader.download(
        job.id,
        job.plan.files.map((file) => (proxy ? { ...file, proxy } : file)),
        { resume: true }
      )
      await this.persist(job, worker, 'ready')
    } catch (error) {
      await this.persist(
        job,
        worker,
        String(error).includes('Download cancelled') ? 'cancelled' : 'failed',
        error
      )
    }
  }
  async cancel(id: string): Promise<ArtifactJob> {
    const active = this.running.get(id)
    const transferred = this.downloader.snapshot().find((transfer) => transfer.taskId === id)?.transferred
    if (active) active.cancelled = true
    this.downloader.cancel(id)
    const job = await this.mutations.run(id, async () => {
      const current = await this.get(id)
      if (current.stage === 'ready') return current
      const worker = this.running.get(id)
      if (worker) worker.cancelled = true
      if (transferred !== undefined) Object.assign(current, { transferred })
      current.stage = 'cancelled'
      current.updated_at = Date.now()
      await writeDocument(this.path(id), current)
      return current
    })
    if (job.stage !== 'ready')
      await this.options.link.request('POST', `/downloads/media-engine-${id}/cancel`, {})
    if (active && transferred !== undefined)
      await active.done.then(() =>
        this.mutations.run(id, async () => {
          const current = await this.get(id)
          await writeDocument(this.path(id), { ...current, transferred })
        })
      )
    return job
  }
  async remove(id: string, cleanup: (job: ArtifactJob) => Promise<void>) {
    const worker = this.running.get(id)
    await this.cancel(id)
    await worker?.done
    return this.mutations.run(id, async () => {
      if (this.running.has(id)) throw new AtcError('ATC_USAGE', 'Pause this download before removing it.')
      await cleanup(await this.get(id))
      await rm(this.path(id), { force: true })
      return { removed: true, id }
    })
  }
  async load(id: string) {
    const job = await this.get(id)
    if (job.stage !== 'ready') throw new AtcError('ATC_USAGE', 'Finish downloading this model first.')
    const link = this.options.link
    if (job.plan.engine === 'mlx') {
      await new ModelRegistry(this.options.paths.layout, 'mlx').write(job.plan.model_id, {
        model_path: String(job.plan.load['model_path']),
        name: job.plan.name,
      })
      return link.models.load('mlx', job.plan.model_id)
    }
    if (['image', 'video'].includes(job.plan.category)) {
      await link.request('PUT', '/diffusion/config', { dataFolder: this.options.paths.dataFolder })
      return link.request('POST', '/diffusion/model/load', job.plan.load)
    }
    await link.request('PUT', `/${job.plan.category}/config`, job.plan.load)
    return link.request('POST', `/${job.plan.category}/load`, {})
  }
  private async get(id: string) {
    const job = await readDocument<ArtifactJob | null>(this.path(id), null)
    if (!job?.plan) throw new AtcError('ATC_USAGE', 'No such media installation.')
    return job
  }
}
