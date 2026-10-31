/**
 * GGUF model setups owned by the server: `models.plan`, `models.install` and `setup.*`. One record
 * per setup in `<atc>/model-setups/<setup id>.json`; the reviewed plans beside them in `plans/`.
 * A record whose server stopped mid-way reads as `interrupted`, and `resume` continues it from the
 * files on disk. Credentials are never stored: the Hugging Face token goes into download headers.
 */
import { randomUUID } from 'node:crypto'
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  ModelSetup,
  ModelSetupPlan,
  ModelSetupPlanRequest,
  ModelSetupStage,
} from '../../contract/index.js'
import { AtcError } from '../../errors/index.js'
import { readDocument, writeDocument } from '../../terminal-data/index.js'
import { planFor, planRequest } from './gguf-facts.js'
import type { GgufFactsDeps } from './gguf-facts.js'
import { runSetup, SetupCancelled, setupFilePaths, setupTaskIds } from './model-setup-run.js'
import { bytesOnDisk } from '../../downloads/index.js'
import { hfResolveUrl } from '@atomic-chat/core/models'
import type { SetupRunDeps } from './model-setup-run.js'
import { SerialWork } from '../serial.js'
import { captureFailure, type ErrorSink } from '../../telemetry/index.js'
import { setupEngineInstaller } from './setup-engines.js'

export type ModelSetupsDeps = SetupRunDeps &
  Pick<GgufFactsDeps, 'fetch'> & { newId?: () => string; errors?: ErrorSink }

const FINAL: readonly ModelSetupStage[] = ['ready', 'failed', 'cancelled']
const RESUMABLE: readonly ModelSetupStage[] = ['failed', 'cancelled', 'interrupted']

interface Run {
  controller: AbortController
  done: Promise<void>
}

export class ModelSetups {
  private readonly dir: string
  private readonly runs = new Map<string, Run>()
  private readonly installEngine
  private readonly writes = new SerialWork()
  private readonly modelWork = new SerialWork()
  constructor(private readonly deps: ModelSetupsDeps) {
    this.installEngine = setupEngineInstaller(deps)
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
    const views = await Promise.all(
      records.filter((r): r is ModelSetup => !!r?.plan).map((r) => this.view(r))
    )
    return views.sort((a, b) => a.created_at - b.created_at)
  }

  private async view(record: ModelSetup): Promise<ModelSetup> {
    if (FINAL.includes(record.stage) || record.stage === 'interrupted' || this.runs.has(record.setup_id))
      return record
    const stopped: ModelSetup = { ...record, stage: 'interrupted', stopped_at: record.stage }
    // The stopped stage's file may be half there: say how much, since no transfer reports it now.
    const artifact =
      record.stage === 'downloading_model'
        ? record.plan.model
        : record.stage === 'downloading_projector'
          ? record.plan.projector
          : null
    if (!artifact) return stopped
    const files = setupFilePaths(this.deps.paths, record.plan)
    const rel = record.stage === 'downloading_model' ? files.model : files.projector
    if (!rel) return stopped
    const transferred = await bytesOnDisk(
      join(this.deps.paths.layout.root, rel),
      hfResolveUrl(artifact.repo, artifact.file, artifact.revision),
      artifact.size
    ).catch(() => 0)
    return { ...stopped, transferred }
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
      // Check and claim the shared files together, even when request IDs differ.
      return this.modelWork.run(reviewed.plan.model_id, async () => {
        const active = await this.activeFor(reviewed.plan.model_id)
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
    })
  }

  private async activeFor(modelId: string): Promise<ModelSetup | undefined> {
    return (await this.list()).find((r) => r.plan.model_id === modelId && this.runs.has(r.setup_id))
  }

  /** Run a stopped setup again from the files already on disk. */
  async resume(id: string): Promise<ModelSetup> {
    // A cancelled run still releasing its files must end before a new one opens them.
    const previous = this.runs.get(id)
    if (previous?.controller.signal.aborted) await previous.done
    const { plan } = await this.get(id)
    return this.modelWork.run(plan.model_id, () =>
      this.writes.run(id, async () => {
        const record = await this.get(id)
        if (this.runs.has(id) || !RESUMABLE.includes(record.stage)) return record
        // One writer per model, as in install: its files have one path, whichever setup asked for them.
        const active = await this.activeFor(record.plan.model_id)
        if (active)
          throw new AtcError('ATC_USAGE', `Setup ${active.setup_id} is installing this model now.`, {
            hint: 'Wait for it, or cancel it before resuming this one.',
          })
        const next = await this.commit(id, { stage: 'queued' }, true)
        this.launch(id)
        return next
      })
    )
  }

  /** Stop a setup; downloaded bytes stay for `resume`. */
  async cancel(id: string): Promise<ModelSetup> {
    const record = await this.get(id)
    const run = this.runs.get(id)
    const ids = Object.values(record.task_ids)
    const transferred = this.deps.downloader
      .snapshot()
      .filter((transfer) => ids.includes(transfer.taskId))
      .reduce((sum, transfer) => sum + transfer.transferred, 0)
    if (run) {
      run.controller.abort()
      await run.done
      return this.writes.run(id, async () => this.commit(id, { ...(await this.get(id)), ...{ transferred } }))
    }
    if (FINAL.includes(record.stage)) return record
    return this.writes.run(id, () => this.commit(id, { stage: 'cancelled', stopped_at: record.stage }))
  }

  async remove(id: string, cleanup: (job: ModelSetup) => Promise<void>) {
    const { plan } = await this.get(id)
    // Cleanup owns the same files as install/resume; wait for the run without holding its write queue.
    return this.modelWork.run(plan.model_id, async () => {
      const active = await this.activeFor(plan.model_id)
      if (active && active.setup_id !== id)
        throw new AtcError('ATC_USAGE', `Pause setup ${active.setup_id} before removing this model.`)
      await this.cancel(id)
      return this.writes.run(id, async () => {
        if (this.runs.has(id)) throw new AtcError('ATC_USAGE', 'Pause this download before removing it.')
        await cleanup(await this.get(id))
        await rm(this.path(id), { force: true })
        return { removed: true, id }
      })
    })
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
    const enter = async (next: ModelSetupStage, patch: Partial<ModelSetup> = {}) => {
      if (signal.aborted) throw new SetupCancelled()
      stage = next
      await this.writes.run(id, () => this.commit(id, { ...patch, stage: next }))
    }
    try {
      await runSetup(this.deps, await this.get(id), signal, enter, this.installEngine, (patch) =>
        this.writes.run(id, () => this.commit(id, patch)).then(() => undefined)
      )
      // Registered and accepted: a cancel arriving now changes nothing on disk, so it is ignored.
      stage = 'ready'
      await this.writes.run(id, () => this.commit(id, { stage: 'ready' }))
    } catch (error) {
      const cancelled =
        signal.aborted || error instanceof SetupCancelled || String(error).includes('Download cancelled')
      const code = String((error as { code?: unknown }).code ?? 'ATC_INTERNAL')
      if (!cancelled)
        captureFailure(this.deps.errors, error, { component: 'model-setup', operation: `setup.${stage}` })
      await this.writes
        .run(id, () =>
          this.commit(
            id,
            cancelled
              ? { stage: 'cancelled', stopped_at: stage }
              : { stage: 'failed', stopped_at: stage, error: { code, message: (error as Error).message } }
          )
        )
        .catch((error: unknown) => {
          captureFailure(this.deps.errors, error, { component: 'model-setup', operation: 'setup.persist' })
        })
    }
  }
}
