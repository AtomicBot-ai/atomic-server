/**
 * GGUF model setups owned by the server: `models.plan`, `models.install` and `setup.*`. One record
 * per setup in `<atc>/model-setups/<setup id>.json`; the reviewed plans beside them in `plans/`.
 * A record whose server stopped mid-way reads as `interrupted`, and `resume` continues it from the
 * files on disk. Credentials are never stored: the Hugging Face token goes into download headers.
 */
import { randomUUID } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  ModelSetup,
  ModelSetupEngine,
  ModelSetupPlan,
  ModelSetupPlanRequest,
  ModelSetupStage,
} from '../contract/index.js'
import { AtcError } from '../errors/index.js'
import { readDocument, writeDocument } from '../terminal-data/index.js'
import { planFor, planRequest } from './gguf-facts.js'
import type { GgufFactsDeps } from './gguf-facts.js'
import { runSetup, SetupCancelled, setupTaskIds } from './model-setup-run.js'
import type { SetupRunDeps } from './model-setup-run.js'
import { SerialWork } from './serial.js'

export type ModelSetupsDeps = SetupRunDeps & Pick<GgufFactsDeps, 'fetch'> & { newId?: () => string }

const FINAL: readonly ModelSetupStage[] = ['ready', 'failed', 'cancelled']
const RESUMABLE: readonly ModelSetupStage[] = ['failed', 'cancelled', 'interrupted']

interface Run {
  controller: AbortController
  done: Promise<void>
}

export class ModelSetups {
  private readonly dir: string
  private readonly runs = new Map<string, Run>()
  private readonly engines = new Map<string, Promise<void>>()
  private readonly writes = new SerialWork()
  constructor(private readonly deps: ModelSetupsDeps) {
    this.dir = join(deps.paths.atcDir, 'model-setups')
  }

  /** `models.plan`, `models.install`, `setup.status`, `setup.resume` and `setup.cancel`. */
  async operation(name: string, input: Record<string, unknown>): Promise<unknown> {
    if (name === 'models.plan') return this.plan(input)
    if (name === 'models.install') return this.install(input)
    if (name === 'setup.status') return { setups: await this.list() }
    const id = String(input['setup_id'])
    if (name === 'setup.resume') return this.resume(id)
    if (name === 'setup.cancel') return this.cancel(id)
    throw new AtcError('ATC_USAGE', `No implementation for ${name}.`)
  }

  private path(id: string) {
    if (!/^[\w-]{1,120}$/.test(id)) throw new AtcError('ATC_USAGE', 'No such model setup.')
    return join(this.dir, `${id}.json`)
  }

  async plan(raw: Record<string, unknown>): Promise<ModelSetupPlan> {
    const request = planRequest(raw)
    const plan = await planFor(this.deps, request)
    await writeDocument(join(this.dir, 'plans', `${plan.digest}.json`), { request, plan })
    return plan
  }

  /** What the server sees now: a record nobody runs that has not ended is `interrupted`. */
  async list(): Promise<ModelSetup[]> {
    const names = await readdir(this.dir).catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return [] as string[]
      throw e
    })
    const records = await Promise.all(
      names
        .filter((n) => n.endsWith('.json'))
        .map((n) => readDocument<ModelSetup | null>(join(this.dir, n), null))
    )
    return records
      .filter((r): r is ModelSetup => !!r?.plan)
      .map((r) => this.view(r))
      .sort((a, b) => a.created_at - b.created_at)
  }

  private view(record: ModelSetup): ModelSetup {
    if (FINAL.includes(record.stage) || record.stage === 'interrupted' || this.runs.has(record.setup_id))
      return record
    return { ...record, stage: 'interrupted', stopped_at: record.stage }
  }

  async get(id: string): Promise<ModelSetup> {
    const record = await readDocument<ModelSetup | null>(this.path(id), null)
    if (!record?.plan)
      throw new AtcError('ATC_USAGE', 'No such model setup.', {
        hint: 'A setup started before this version of Atomic Server is not continued; start it again and the files already downloaded are reused.',
      })
    return this.view(record)
  }

  /** Start the reviewed plan. The same `request_id` returns the setup it started. */
  install(input: Record<string, unknown>): Promise<ModelSetup> {
    const requestId = String(input['request_id'] ?? '')
    if (!/^[\w-]{1,120}$/.test(requestId))
      throw new AtcError('ATC_USAGE', 'Use a request ID containing letters, numbers, underscores or hyphens.')
    return this.writes.run(`request:${requestId}`, async () => {
      const request = planRequest(input['request'] as Record<string, unknown>)
      const digest = String(input['plan_digest'] ?? '')
      const same = (await this.list()).find((r) => r.request_id === requestId)
      if (same) {
        if (
          same.plan.digest !== digest ||
          same.request.repo !== request.repo ||
          same.request.file !== request.file
        )
          throw new AtcError('ATC_USAGE', 'That request ID was already used for another setup.')
        return same
      }
      const reviewed = /^[a-f0-9]{64}$/.test(digest)
        ? await readDocument<{ request: ModelSetupPlanRequest; plan: ModelSetupPlan } | null>(
            join(this.dir, 'plans', `${digest}.json`),
            null
          )
        : null
      if (!reviewed || reviewed.request.repo !== request.repo || reviewed.request.file !== request.file)
        throw new AtcError(
          'ATC_USAGE',
          'Review this model installation with models.plan before installing it.'
        )
      const blocker = reviewed.plan.blockers[0]
      if (blocker) throw new AtcError('ATC_USAGE', blocker.message)
      // One writer per model: its files have one path, whichever request asked for them.
      const active = (await this.list()).find(
        (r) => r.plan.model_id === reviewed.plan.model_id && this.runs.has(r.setup_id)
      )
      if (active) return active
      const setupId = (this.deps.newId ?? randomUUID)()
      const now = Date.now()
      const record: ModelSetup = {
        setup_id: setupId,
        request_id: requestId,
        stage: 'queued',
        request,
        plan: reviewed.plan,
        task_ids: setupTaskIds(setupId, reviewed.plan),
        created_at: now,
        updated_at: now,
      }
      await writeDocument(this.path(setupId), record)
      this.launch(setupId)
      return record
    })
  }

  /** Run a stopped setup again from the files already on disk. */
  async resume(id: string): Promise<ModelSetup> {
    // A cancelled run still releasing its files must end before a new one opens them.
    const previous = this.runs.get(id)
    if (previous?.controller.signal.aborted) await previous.done
    return this.writes.run(id, async () => {
      const record = await this.get(id)
      if (this.runs.has(id) || !RESUMABLE.includes(record.stage)) return record
      const next = await this.commit(id, { stage: 'queued' }, true)
      this.launch(id)
      return next
    })
  }

  /** Stop a setup; downloaded bytes stay for `resume`. */
  async cancel(id: string): Promise<ModelSetup> {
    const record = await this.get(id)
    const run = this.runs.get(id)
    if (run) {
      run.controller.abort()
      await run.done
      return this.get(id)
    }
    if (FINAL.includes(record.stage)) return record
    return this.writes.run(id, () => this.commit(id, { stage: 'cancelled', stopped_at: record.stage }))
  }

  private async commit(id: string, patch: Partial<ModelSetup>, clear = false): Promise<ModelSetup> {
    const current = await readDocument<ModelSetup | null>(this.path(id), null)
    if (!current) throw new AtcError('ATC_USAGE', 'No such model setup.')
    const next: ModelSetup = { ...current, ...patch, updated_at: Date.now() }
    if (clear) {
      delete next.error
      delete next.stopped_at
    }
    await writeDocument(this.path(id), next)
    return next
  }

  private launch(id: string): void {
    const controller = new AbortController()
    const done = this.run(id, controller.signal).finally(() => {
      if (this.runs.get(id)?.controller === controller) this.runs.delete(id)
    })
    this.runs.set(id, { controller, done })
  }

  private async run(id: string, signal: AbortSignal): Promise<void> {
    let stage: ModelSetupStage = 'queued'
    const enter = async (next: ModelSetupStage) => {
      if (signal.aborted) throw new SetupCancelled()
      stage = next
      await this.writes.run(id, () => this.commit(id, { stage: next }))
    }
    try {
      await runSetup(this.deps, await this.get(id), signal, enter, (engine, taskId) =>
        this.install1(engine, taskId)
      )
      // Registered and accepted: a cancel arriving now changes nothing on disk, so it is ignored.
      stage = 'ready'
      await this.writes.run(id, () => this.commit(id, { stage: 'ready' }))
    } catch (error) {
      const cancelled =
        signal.aborted || error instanceof SetupCancelled || String(error).includes('Download cancelled')
      const code = String((error as { code?: unknown }).code ?? 'ATC_INTERNAL')
      await this.writes
        .run(id, () =>
          this.commit(
            id,
            cancelled
              ? { stage: 'cancelled', stopped_at: stage }
              : { stage: 'failed', stopped_at: stage, error: { code, message: (error as Error).message } }
          )
        )
        .catch(() => {
          /* The record stays as it was; it reads as interrupted. */
        })
    }
  }

  /** One install per build, shared by every setup waiting on it. */
  private install1(engine: ModelSetupEngine, taskId: string): Promise<void> {
    const key = `${engine.version}/${engine.backend}`
    let pending = this.engines.get(key)
    if (!pending) {
      pending = this.deps.link
        .request('POST', '/backends/atomic-prism/install', {
          version: engine.version,
          backend: engine.backend,
          task_id: taskId,
        })
        .then(() => undefined)
        .finally(() => this.engines.delete(key))
      this.engines.set(key, pending)
    }
    return pending
  }
}
