import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { CoreLink } from '../core-link/index.js'
import { readDocument, writeDocument } from '../terminal-data/index.js'
import { activateEngine } from './engines.js'
import { engineCatalogs, installedEngines, registeredEngines } from './engine-catalogs.js'
import { SetupPathRecord } from './setup-path.js'
import { sameFiles } from './same-files.js'
import type {
  BackendCatalogResponse,
  EngineSetupJob,
  ModelSetup,
  ModelSetupPlan,
  ModelSetupPlanRequest,
  SetupManifest,
  SetupProgress,
  SetupSelection,
  Transfer,
} from './types.js'
/** The server's workspace, where setups run and their downloads are reported. */
export interface SetupWorkspace {
  execute(operation: string, input?: Record<string, unknown>): Promise<unknown>
  snapshot(): Promise<{ downloads: unknown[]; setups: unknown[] }>
}
function planInput(request: ModelSetupPlanRequest): ModelSetupPlanRequest {
  const { repo, file, revision, model_id, include_projector } = request
  return {
    repo,
    file,
    ...(revision !== undefined ? { revision } : {}),
    ...(model_id !== undefined ? { model_id } : {}),
    ...(include_projector !== undefined ? { include_projector } : {}),
  }
}
const legacy = (manifest: SetupManifest) => manifest.version !== 2 && !manifest.complete
export class TerminalSetup {
  private samples = new Map<string, { bytes: number; at: number; speed: number }>()
  private path: string
  private transfers = new Map<string, Transfer>()
  constructor(
    directory: string,
    private attach: (launch: boolean) => Promise<CoreLink>,
    private workspace: SetupWorkspace
  ) {
    this.path = join(directory, 'setup.json')
    this.record = new SetupPathRecord(directory)
  }
  private readonly record: SetupPathRecord
  read(): Promise<SetupManifest | null> {
    return readDocument(this.path, null)
  }
  /** Every engine the core registers on this host, in display order. */
  async engines(): Promise<string[]> {
    return registeredEngines(await this.attach(true))
  }
  /** The registered engines installed here. */
  async installed(): Promise<string[]> {
    return installedEngines(await this.attach(true))
  }
  readPath = () => this.record.read()
  savePath = (job: EngineSetupJob) => this.record.save(job)
  clearPath = () => this.record.clear()
  /** The live build catalog of each llama.cpp engine the core registers here. */
  async catalogs(): Promise<BackendCatalogResponse[]> {
    return engineCatalogs(await this.attach(true))
  }
  async plan(request: ModelSetupPlanRequest, requestId: string = randomUUID()): Promise<SetupSelection> {
    const input = planInput(request)
    const plan = (await this.workspace.execute('models.plan', { ...input })) as ModelSetupPlan
    if (plan.blockers.length) throw new Error(plan.blockers.map((b) => b.message).join(' '))
    return { request: input, plan, requestId }
  }
  event(name: string, raw: unknown): void {
    if (name !== 'download:progress') return
    const t = raw as Transfer
    if (typeof t.taskId === 'string' && Number.isFinite(t.transferred)) {
      const previous = this.samples.get(t.taskId),
        now = Date.now()
      if (!previous || t.transferred !== previous.bytes) {
        const rate =
          previous && now > previous.at
            ? Math.max(0, ((t.transferred - previous.bytes) * 1000) / (now - previous.at))
            : 0
        this.samples.set(t.taskId, {
          bytes: t.transferred,
          at: now,
          speed: previous?.speed ? previous.speed * 0.6 + rate * 0.4 : rate,
        })
      }
      this.transfers.set(t.taskId, t)
    }
  }
  async begin(
    mode: SetupManifest['mode'],
    engine: string,
    selections: SetupSelection[]
  ): Promise<SetupProgress> {
    if (!selections.length) throw new Error('Choose at least one model.')
    const previous = await this.read()
    if (
      previous &&
      !previous.complete &&
      previous.version === 2 &&
      `${previous.engine.provider}|${previous.engine.version}|${previous.engine.backend}` === engine &&
      previous.selections.length === selections.length &&
      // The same files, by what the Hub says of them (size, hash): one it changed since gets its fresh
      // plan installed; an engine installed in the meantime is not a change of file.
      previous.selections.every(
        (s, i) =>
          s.request.repo === selections[i]?.request.repo &&
          s.request.file === selections[i]?.request.file &&
          sameFiles(s.plan, selections[i]?.plan)
      )
    )
      return this.resume()
    const [provider, version, ...backend] = engine.split('|')
    if (!provider || !version || !backend.length) throw new Error('Choose an engine build.')
    const manifest: SetupManifest = {
      version: 2,
      mode,
      startedAt: Date.now(),
      complete: false,
      onboarded: previous?.onboarded === true || previous?.complete === true,
      engine: { provider, version, backend: backend.join('|'), taskId: `terminal-engine-${randomUUID()}` },
      selections,
    }
    const link = await this.attach(true)
    const remaining = selections.reduce((sum, s) => sum + s.plan.total_download_bytes, 0)
    const free = await link.disk.available()
    if (free !== null && free < remaining + 1024 ** 3)
      throw new Error(
        'There is not enough disk space for the selected models and engine. Remove a selection or free some space.'
      )
    await writeDocument(this.path, manifest)
    return this.resume()
  }
  /** The server owns every transfer; losing this client does not stop a background download. */
  async resume(): Promise<SetupProgress> {
    let manifest = await this.read()
    if (!manifest) throw new Error('Choose your engine and models first.')
    if (legacy(manifest)) {
      // An earlier version's core ran these setups and no longer can: plan them again under the
      // same request ids. The partial files stay where they were and the downloads continue them.
      const selections = await Promise.all(manifest.selections.map((s) => this.plan(s.request, s.requestId)))
      manifest = { ...manifest, version: 2, selections }
      await writeDocument(this.path, manifest)
    }
    const link = await this.attach(true)
    await this.ensureEngine(link, manifest)
    const { setups } = (await this.workspace.execute('setup.status')) as { setups: ModelSetup[] }
    for (const item of manifest.selections) {
      const existing = setups.find((s) => s.request_id === item.requestId)
      if (!existing)
        await this.workspace.execute('models.install', {
          request: item.request,
          plan_digest: item.plan.digest,
          request_id: item.requestId,
        })
      else if (['failed', 'cancelled', 'interrupted'].includes(existing.stage))
        await this.workspace.execute('setup.resume', { setup_id: existing.setup_id })
    }
    return this.progress()
  }
  async progress(): Promise<SetupProgress> {
    const manifest = await this.read()
    if (!manifest) throw new Error('No installation is in progress.')
    if (legacy(manifest))
      return {
        manifest,
        jobs: [],
        engineReady: false,
        speed: 0,
        eta: null,
        transfers: [],
        error: '',
        ready: false,
        restart: true,
      }
    const link = await this.attach(false)
    // One snapshot carries both the setup records and their transfers.
    const [packs, snapshot] = await Promise.all([
      link.request<{ backends: { version: string; backend: string }[] }>(
        'GET',
        `/backends/${manifest.engine.provider}`
      ),
      this.workspace.snapshot(),
    ])
    const list = { setups: snapshot.setups as ModelSetup[] }
    const engineReady = packs.backends.some(
      (p) => p.version === manifest.engine.version && p.backend === manifest.engine.backend
    )
    const jobs = manifest.selections.flatMap((s) => list.setups.filter((j) => j.request_id === s.requestId))
    // Snapshot recovers progress after reconnect; streaming events fill the intervals.
    for (const raw of snapshot.downloads) {
      const t = raw as Transfer & { progress?: Transfer }
      if (t.progress) this.event('download:progress', { ...t.progress, taskId: t.taskId })
      else this.event('download:progress', t)
    }
    const ids = new Set([
      manifest.engine.taskId,
      ...jobs.flatMap((j) => Object.values(j.task_ids).filter((id): id is string => !!id)),
    ])
    const ready =
      manifest.selections.length > 0 &&
      engineReady &&
      jobs.length === manifest.selections.length &&
      jobs.every((j) => j.stage === 'ready')
    const speed = [...this.samples.entries()]
      .filter(
        ([id, sample]) =>
          ids.has(id) &&
          id !== manifest.engine.taskId &&
          Date.now() - sample.at < 12000 &&
          (this.transfers.get(id)?.percent ?? 0) < 100
      )
      .reduce((sum, [, sample]) => sum + sample.speed, 0)
    const remaining = manifest.selections.reduce((sum, selection) => {
      const job = jobs.find((j) => j.request_id === selection.requestId)
      if (job?.stage === 'ready') return sum
      const downloaded = Object.values(job?.task_ids ?? {}).reduce<number>(
        (n, id) => n + (id ? (this.transfers.get(id)?.transferred ?? 0) : 0),
        0
      )
      return sum + Math.max(0, selection.plan.total_download_bytes - downloaded)
    }, 0)
    const eta = speed > 0 ? Math.ceil(remaining / speed) : null
    return {
      manifest,
      jobs,
      engineReady,
      speed,
      eta,
      transfers: [...this.transfers.values()].filter((t) => ids.has(t.taskId)),
      error: jobs.find((j) => j.error)?.error?.message || '',
      ready,
    }
  }
  async pause(): Promise<void> {
    const progress = await this.progress()
    await Promise.all(
      progress.jobs
        .filter((j) => j.stage !== 'ready')
        .map((j) => this.workspace.execute('setup.cancel', { setup_id: j.setup_id }))
    )
    // Engine installs belong to the shared queue; pausing a model must not cancel them.
  }
  async finish(): Promise<SetupManifest> {
    const progress = await this.progress()
    if (!progress.ready) throw new Error('Finish installing every selected component before continuing.')
    const link = await this.attach(false),
      manifest = progress.manifest
    await activateEngine(link, manifest.engine)
    const first = manifest.selections[0]!.plan
    await link.models.load(
      first.provider === 'atomic-prism' ? first.provider : manifest.engine.provider,
      first.model_id
    )
    const completed = { ...manifest, complete: true, onboarded: true }
    await writeDocument(this.path, completed)
    return completed
  }
  private async ensureEngine(link: CoreLink, manifest: SetupManifest) {
    const engine = manifest.engine
    // The setup that needs a PrismML build installs and activates it; a second install is refused.
    if (engine.provider === 'atomic-prism') return
    const { backends } = await link.request<{ backends: { version: string; backend: string }[] }>(
      'GET',
      `/backends/${engine.provider}`
    )
    if (backends.some((p) => p.version === engine.version && p.backend === engine.backend)) return
    await this.workspace.execute('engines.enqueue', {
      engine: engine.provider,
      target: { version: engine.version, variant: engine.backend },
    })
  }
}
