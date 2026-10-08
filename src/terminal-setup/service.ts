import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { CoreLink } from '../core-link/index.js'
import { readDocument, writeDocument } from '../terminal-data/index.js'
import { setupWait } from './wait.js'
import type {
  BackendCatalogResponse,
  ModelSetup,
  ModelSetupPlan,
  ModelSetupPlanRequest,
  SetupManifest,
  SetupProgress,
  SetupSelection,
  Transfer,
} from './types.js'
export class TerminalSetup {
  private samples = new Map<string, { bytes: number; at: number; speed: number }>()
  private path: string
  private engineInstall: Promise<unknown> | undefined
  private engineError = ''
  private transfers = new Map<string, Transfer>()
  constructor(
    directory: string,
    private attach: (launch: boolean) => Promise<CoreLink>
  ) {
    this.path = join(directory, 'setup.json')
  }
  read(): Promise<SetupManifest | null> {
    return readDocument(this.path, null)
  }
  async catalogs(): Promise<BackendCatalogResponse[]> {
    const link = await this.attach(true)
    const outcomes = await Promise.allSettled(
      ['llamacpp-upstream', 'llamacpp', 'atomic-prism'].map((p) =>
        setupWait(
          link.request<BackendCatalogResponse>('POST', `/backends/${p}/catalog`, {}),
          new AbortController().signal,
          15000
        )
      )
    )
    const catalogs = outcomes.flatMap((r) =>
      r.status === 'fulfilled' && r.value.available.length ? [r.value] : []
    )
    if (!catalogs.length)
      throw new Error('No compatible engine could be found. Check your connection and retry.')
    return catalogs
  }
  async plan(request: ModelSetupPlanRequest): Promise<SetupSelection> {
    const link = await this.attach(true)
    const plan = await link.request<ModelSetupPlan>('POST', '/models/setup-plan', request)
    if (plan.blockers.length) throw new Error(plan.blockers.map((b) => b.message).join(' '))
    return { request, plan, requestId: randomUUID() }
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
      `${previous.engine.provider}|${previous.engine.version}|${previous.engine.backend}` === engine &&
      previous.selections.length === selections.length &&
      previous.selections.every(
        (s, i) =>
          s.request.repo === selections[i]?.request.repo && s.request.file === selections[i]?.request.file
      )
    )
      return this.resume()
    const [provider, version, ...backend] = engine.split('|')
    if (!provider || !version || !backend.length) throw new Error('Choose an engine build.')
    const manifest: SetupManifest = {
      version: 1,
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
  /** Core owns every transfer; losing this HTTP client does not stop a background download. */
  async resume(): Promise<SetupProgress> {
    const manifest = await this.read()
    if (!manifest) throw new Error('Choose your engine and models first.')
    const link = await this.attach(true)
    this.engineError = ''
    await this.ensureEngine(link, manifest)
    const { setups } = await link.request<{ setups: ModelSetup[] }>('GET', '/model-setups')
    for (const item of manifest.selections) {
      const existing = setups.find((s) => s.request_id === item.requestId)
      if (!existing)
        await link.request('POST', '/model-setups', {
          ...item.request,
          request_id: item.requestId,
          plan_digest: item.plan.digest,
        })
      else if (['failed', 'cancelled', 'interrupted'].includes(existing.stage))
        await link.request('POST', `/model-setups/${existing.setup_id}/resume`, {})
    }
    return this.progress()
  }
  async progress(): Promise<SetupProgress> {
    const manifest = await this.read()
    if (!manifest) throw new Error('No installation is in progress.')
    const link = await this.attach(false)
    const [list, packs, snapshot] = await Promise.all([
      link.request<{ setups: ModelSetup[] }>('GET', '/model-setups'),
      link.request<{ backends: { version: string; backend: string }[] }>(
        'GET',
        `/backends/${manifest.engine.provider}`
      ),
      link.snapshot(),
    ])
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
    const ids = new Set([manifest.engine.taskId, ...jobs.flatMap((j) => Object.values(j.task_ids))])
    const ready =
      engineReady && jobs.length === manifest.selections.length && jobs.every((j) => j.stage === 'ready')
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
      const downloaded = Object.values(job?.task_ids ?? {}).reduce(
        (n, id) => n + (this.transfers.get(id)?.transferred ?? 0),
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
      error: this.engineError || jobs.find((j) => j.error)?.error?.message || '',
      ready,
    }
  }
  async pause(): Promise<void> {
    const progress = await this.progress(),
      link = await this.attach(false)
    await Promise.all(
      progress.jobs
        .filter((j) => j.stage !== 'ready')
        .map((j) => link.request('POST', `/model-setups/${j.setup_id}/cancel`))
    )
    if (!progress.engineReady)
      await link.request('POST', `/downloads/${encodeURIComponent(progress.manifest.engine.taskId)}/cancel`)
  }
  async finish(): Promise<SetupManifest> {
    const progress = await this.progress()
    if (!progress.ready) throw new Error('Finish installing every selected component before continuing.')
    const link = await this.attach(false),
      manifest = progress.manifest
    await link.request('PATCH', `/settings/${manifest.engine.provider}`, {
      values: { version_backend: `${manifest.engine.version}/${manifest.engine.backend}` },
    })
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
    const { backends } = await link.request<{ backends: { version: string; backend: string }[] }>(
      'GET',
      `/backends/${engine.provider}`
    )
    if (
      backends.some((p) => p.version === engine.version && p.backend === engine.backend) ||
      this.engineInstall
    )
      return
    const snapshot = await link.snapshot()
    if (snapshot.downloads.some((d) => (d as { taskId?: string }).taskId === engine.taskId)) return
    this.engineInstall = link
      .request('POST', `/backends/${engine.provider}/install`, {
        version: engine.version,
        backend: engine.backend,
        task_id: engine.taskId,
      })
      .catch((e: unknown) => {
        this.engineError = e instanceof Error ? e.message : 'Engine installation failed.'
      })
      .finally(() => {
        this.engineInstall = undefined
      })
  }
}
