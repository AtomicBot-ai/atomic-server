/** Server-owned engine build jobs. UI lifetimes never own or cancel a core installation. */
import { randomUUID } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { EngineVersionsResponse } from '@atomic-chat/core/contracts'
import type { CoreLink } from '../core-link/index.js'
import type { ProxyConfig } from '../downloads/index.js'
import { AtcError } from '../errors/index.js'
import { readDocument, writeDocument } from '../terminal-data/index.js'
import { EngineSelection } from '../terminal-setup/index.js'
import { engineName } from '../workspace-view/index.js'
import { engineKind, ensureArtifactEngine, installEngine } from './engine-install.js'
import { object } from './validation.js'
import { SerialWork } from './serial.js'

interface EngineJob extends Record<string, unknown> {
  id: string
  taskId: string
  kind: 'engine'
  engine: string
  name: string
  target: Record<string, unknown>
  stage: string
  transferred: number
  total: number
  created_at: number
  updated_at: number
}
const terminal = new Set(['ready', 'failed', 'interrupted'])
export class EngineDownloads {
  private jobs = new Map<string, EngineJob>()
  private runs = new Map<string, Promise<void>>()
  private admission = new SerialWork()
  private worker = new SerialWork()
  private loaded: Promise<void> | undefined
  private selection: EngineSelection
  constructor(
    private directory: string,
    private link: CoreLink,
    private proxy?: ProxyConfig | null
  ) {
    this.selection = new EngineSelection(directory, async () => link)
  }
  private path(id: string) {
    return join(this.directory, 'engine-downloads', `${id}.json`)
  }
  private load() {
    return (this.loaded ??= (async () => {
      const dir = join(this.directory, 'engine-downloads')
      const files = await readdir(dir).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return []
        throw error
      })
      for (const file of files.filter((name) => /^[\w-]+\.json$/.test(name))) {
        const job = await readDocument<EngineJob | null>(join(dir, file), null)
        if (!job || job.kind !== 'engine' || !/^[\w-]+$/.test(job.id)) continue
        if (!terminal.has(job.stage)) job.stage = 'interrupted'
        this.jobs.set(job.id, job)
      }
    })())
  }
  /** Read-only progress copies preserve the job after the core removes its transient transfer. */
  async list(transfers: readonly unknown[] = []) {
    await this.load()
    for (const transfer of transfers) this.event('download:progress', transfer)
    return [...this.jobs.values()].map((job) => ({ ...job, state: job.stage }))
  }
  event(name: string, payload: unknown) {
    const value = object(payload)
    const job = this.jobs.get(String(value['taskId'] ?? ''))
    if (!job || !this.runs.has(job.id) || terminal.has(job.stage)) return
    if (name === 'download:progress') {
      job.transferred = Math.max(0, Number(value['transferred']) || 0)
      job.total = Math.max(0, Number(value['total']) || 0)
      job.stage = job.total > 0 && job.transferred >= job.total ? 'installing' : 'downloading'
      job.updated_at = Date.now()
    }
    if (
      name === 'download:stage' &&
      ['verifying', 'extracting', 'installing'].includes(String(value['stage']))
    )
      job.stage = String(value['stage'])
  }
  /** Enqueue promptly; matching active requests share one core install and one queue row. */
  enqueue(engine: string, input: Record<string, unknown> = {}) {
    return this.admission.run('queue', async () => {
      await this.load()
      const kind = engineKind(engine)
      if (kind !== 'llamacpp' && kind !== 'engine-build')
        throw new AtcError('ATC_USAGE', 'Use the engine setup screen to review this engine installation.')
      let target = object(input['target'])
      if (!Object.keys(target).length && kind === 'llamacpp') {
        const versions = await this.link.request<EngineVersionsResponse>('POST', '/engines/versions', {})
        const latest = versions.engines.find((entry) => entry.engine === engine)?.latest
        if (!latest) throw new AtcError('ATC_USAGE', 'No compatible engine build is available.')
        target = { version: latest.version, variant: latest.variant }
      }
      if (Object.keys(target).length) {
        if (
          typeof target['version'] !== 'string' ||
          !target['version'] ||
          typeof target['variant'] !== 'string' ||
          !target['variant']
        )
          throw new AtcError('ATC_USAGE', 'Choose an engine build with a version and variant.')
        target = { version: target['version'], variant: target['variant'] }
      }
      const existing = [...this.jobs.values()].find(
        (job) =>
          job.engine === engine &&
          this.runs.has(job.id) &&
          job.target['version'] === target['version'] &&
          job.target['variant'] === target['variant']
      )
      const stopped = [...this.jobs.values()].find(
        (job) =>
          job.engine === engine &&
          ['failed', 'interrupted'].includes(job.stage) &&
          job.target['version'] === target['version'] &&
          job.target['variant'] === target['variant']
      )
      const now = Date.now()
      const id = randomUUID()
      const job: EngineJob = existing ??
        stopped ?? {
          id,
          taskId: id,
          kind: 'engine',
          engine,
          name: engineName(engine),
          target,
          stage: 'queued',
          transferred: 0,
          total: 0,
          created_at: now,
          updated_at: now,
        }
      if (input['select'] === true) {
        const choice = `${engine}|${String(target['version'] ?? '')}|${String(target['variant'] ?? '')}`
        await this.selection.remember(choice)
        job['selection'] = choice
      }
      if (!existing) {
        job.stage = 'queued'
        job.transferred = 0
        delete job['error']
        await writeDocument(this.path(job.id), job)
        this.jobs.set(job.id, job)
        this.launch(job)
      }
      return { ...job, state: job.stage }
    })
  }
  async retry(id: string) {
    return this.admission.run('queue', async () => {
      await this.load()
      const job = this.jobs.get(id)
      if (!job) throw new AtcError('ATC_USAGE', 'No such engine download.')
      if (this.runs.has(id) || job.stage === 'ready') return { ...job }
      job.stage = 'queued'
      job.transferred = 0
      delete job['error']
      await writeDocument(this.path(id), job)
      this.launch(job)
      return { ...job }
    })
  }
  /** A model or second client waits on the existing install instead of launching a duplicate. */
  async ensure(engine: string, taskId: string, target?: Record<string, unknown>) {
    await this.load()
    const [selected, version, variant] = (await this.selection.read()).split('|')
    if (!target && selected === engine && version && variant) target = { version, variant }
    const install = async () => {
      const job = await this.enqueue(engine, target ? { target } : {})
      await this.runs.get(job.id)
      const result = this.jobs.get(job.id)!
      if (result.stage !== 'ready')
        throw new AtcError('ATC_INTERNAL', String(result['error'] ?? 'Engine installation failed.'))
    }
    const pending = [...this.jobs.values()].find(
      (job) =>
        job.engine === engine &&
        this.runs.has(job.id) &&
        (!target ||
          (job.target['version'] === target['version'] && job.target['variant'] === target['variant']))
    )
    if (pending) {
      await this.runs.get(pending.id)
      if (pending.stage !== 'ready')
        throw new AtcError('ATC_INTERNAL', String(pending['error'] ?? 'Engine installation failed.'))
      return
    }
    if (target) {
      const result = await this.link.request<{ backends: Array<{ version: string; backend: string }> }>(
        'GET',
        `/backends/${engine}`
      )
      if (
        result.backends.some(
          (build) => build.version === target['version'] && build.backend === target['variant']
        )
      )
        return
      await install()
    } else await ensureArtifactEngine(this.link, engine, taskId, this.proxy, install)
  }
  private launch(job: EngineJob) {
    const run = this.worker
      .run('engine-builds', async () => {
        job.stage = 'connecting'
        job['started_at'] = Date.now()
        await writeDocument(this.path(job.id), job)
        try {
          await installEngine(
            this.link,
            job.engine,
            {
              task_id: job.id,
              ...(Object.keys(job.target).length ? { target: job.target } : {}),
            },
            this.proxy
          )
          job.stage = 'ready'
          job.transferred = job.total
          if (job['selection'] && (await this.selection.read()) === job['selection']) {
            const result = await this.link.request<EngineVersionsResponse>('POST', '/engines/versions', {})
            const active = result.engines.find((entry) => entry.engine === job.engine)?.active
            if (active) await this.selection.remember(`${job.engine}|${active.version}|${active.variant}`)
          }
        } catch (error) {
          job.stage = 'failed'
          job['error'] = error instanceof Error ? error.message : String(error)
        }
        job.updated_at = Date.now()
        await writeDocument(this.path(job.id), job)
      })
      .catch(() => {
        job.stage = 'interrupted'
      })
      .finally(() => this.runs.delete(job.id))
    this.runs.set(job.id, run)
  }
}
