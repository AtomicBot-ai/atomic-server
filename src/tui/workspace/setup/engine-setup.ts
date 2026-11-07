/**
 * Guided setup for engines with their own model catalogs and installation plans.
 * Onboarding browses the chosen engine while it installs; manual setup opens its engine panel first.
 * Durable jobs resume across terminals; Ready loads the model with the selected engine.
 */
import { randomUUID } from 'node:crypto'
import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type { EngineId } from '@atomic-chat/core/contracts'
import type {
  FoundryModelPlan,
  LiteRtModelPlan,
  ManagedModelPlan,
  ManagedVerdict,
  WorkspaceSnapshot,
} from '../../../contract/index.js'
import type { EngineSetupJob, EngineSetupPath, SetupView } from '../../../terminal-setup/index.js'
import { engineSetupRows } from './engine-setup-rows.js'
import type { ActionContext } from '../actions.js'
import { engineAction } from '../library/engine-actions.js'
import { returnToConnection } from '../server/connection-model-return.js'

type Context = Pick<ActionContext, 'controller' | 'get' | 'update'>

/** An engine setup takes this path for: a managed engine, Foundry Local or LiteRT-LM. */
export const pathKind = (engine: string): EngineSetupPath['kind'] | null =>
  ENGINE_KINDS[engine as EngineId] === 'managed'
    ? 'managed'
    : engine === 'foundry-local'
      ? 'foundry'
      : engine === 'litert-lm'
        ? 'litert'
        : engine === 'fastflowlm'
          ? 'fastflowlm'
          : engine === 'geniex'
            ? 'geniex'
            : null

/** The operations of a path's own downloads: plan, install. */
const OPS = {
  foundry: { plan: 'foundry.plan', install: 'foundry.install', job: 'foundry-model' },
  fastflowlm: { plan: 'fastflowlm.plan', install: 'fastflowlm.install', job: 'fastflowlm-model' },
  geniex: { plan: 'geniex.plan', install: 'geniex.install', job: 'geniex-model' },
  litert: { plan: 'litert.plan', install: 'litert.install', job: 'litert-model' },
  managed: { plan: 'managed.plan', install: 'managed.install', job: 'managed-model' },
} as const
const JOB_INSTALL: Record<EngineSetupJob['kind'], string> = {
  'managed-model': 'managed.install',
  'foundry-model': 'foundry.install',
  'litert-model': 'litert.install',
  'fastflowlm-model': 'fastflowlm.install',
  'geniex-model': 'geniex.install',
}

/** The job's state as the snapshot shows it: its stage, and its bytes while it downloads. */
export function pathJob(setup: SetupView, snapshot: WorkspaceSnapshot | null) {
  const job = setup.path?.job
  if (!job || !snapshot) return null
  const record = (
    snapshot.setups as Array<{
      id?: string
      stage?: string
      error?: string
      plan?: { download_bytes?: number; digest?: string }
    }>
  ).find((r) => r.id === job.id)
  const transfers = (
    snapshot.downloads as Array<{ taskId?: string; transferred?: number; total?: number }>
  ).filter((d) => d.taskId === job.id)
  return {
    digest: record?.plan?.digest ?? null,
    stage: record?.stage ?? 'queued',
    error: record?.error ?? null,
    done: transfers.reduce((n, t) => n + (t.transferred ?? 0), 0),
    total: record?.plan?.download_bytes ?? transfers.reduce((n, t) => n + (t.total ?? 0), 0),
  }
}

/** Whether `id` is the engine path's to handle, decided without waiting (the GGUF path updates at once). */
export function isPathAction(id: string, view: SetupView): boolean {
  return (
    id.startsWith('setup-path-') ||
    (id.startsWith('setup-engine:') && pathKind(id.slice('setup-engine:'.length)) !== null) ||
    (id === 'setup-search' && view.path !== null && view.stage === 'models')
  )
}

export async function engineSetupAction(id: string, ctx: Context): Promise<boolean> {
  const { controller: c, get, update } = ctx
  const view = get().setup
  if (!view) return false
  const change = (p: Partial<SetupView>) =>
    update((s) => ({ ...s, setup: s.setup ? { ...s.setup, ...p } : null }))
  const path = (p: Partial<EngineSetupPath>) =>
    update((s) => (s.setup?.path ? { ...s, setup: { ...s.setup, path: { ...s.setup.path, ...p } } } : s))
  const focus = (value: string) =>
    update((s) =>
      (s.firstRun && s.page === 'welcome') || (s.setup?.destination && !['setup', 'models'].includes(s.page))
        ? s
        : { ...s, focus: value, selected: 0, hover: '', overlay: null }
    )
  const run = async (work: () => Promise<void>) => {
    change({ busy: true, error: '' })
    try {
      await work()
    } catch (e) {
      change({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      change({ busy: false })
    }
    return true
  }
  const engine = id.startsWith('setup-engine:') ? id.slice('setup-engine:'.length) : ''
  const kind = pathKind(engine)
  // The engine's own panel, inside setup: its "Choose models >" comes back here.
  const openPanel = async (name: string) => {
    await engineAction(`engine-open:${name}`, ctx)
    update((s) => (s.enginePanel ? { ...s, enginePanel: { ...s.enginePanel, inSetup: true } } : s))
    return true
  }
  if (kind) {
    const onboardingChoice = kind !== 'managed' && get().firstRun && get().engine.split('|')[0] === engine
    if (!view.installed.includes(engine) && !onboardingChoice) return openPanel(engine)
    change({ engine, stage: 'models', query: '', path: { engine, kind, rows: [], plan: null, job: null } })
    return run(async () => {
      path({ rows: await engineSetupRows(c, get().setup!.path!, '') })
      focus('setup-path-repo:0')
    })
  }
  if (id === 'setup-path-continue') {
    const p = get().enginePanel
    if (!p) return true
    update((s) => ({
      ...s,
      overlay: null,
      enginePanel: null,
      setup: s.setup ? { ...s.setup, installed: [...new Set([...s.setup.installed, p.engine])] } : null,
    }))
    return engineSetupAction(`setup-engine:${p.engine}`, ctx)
  }
  const current = view.path
  if (!current || !id.startsWith('setup-')) return false
  // A variant that waits on Foundry Local or LiteRT-LM itself: its panel installs it or prepares the accelerator.
  if (id === 'setup-path-foundry') return openPanel('foundry-local')
  if (id === 'setup-path-fastflowlm') return openPanel('fastflowlm')
  if (id === 'setup-path-geniex') return openPanel('geniex')
  if (id === 'setup-path-litert') return openPanel('litert-lm')
  if (id === 'setup-search' && view.stage === 'models')
    return run(async () => path({ rows: await engineSetupRows(c, current, view.query) }))
  if (id.startsWith('setup-path-repo:')) {
    const row = current.rows[Number(id.slice('setup-path-repo:'.length))]
    if (!row) return true
    return run(async () => {
      if (current.kind === 'managed') {
        const [plan, checked] = await Promise.all([
          c.runtime.execute('managed.plan', { repository: row.id, engine: current.engine }),
          c.runtime.execute('models.check', { repository: row.id }),
        ])
        path({
          plan: plan as ManagedModelPlan,
          verdicts: (checked as { verdicts: ManagedVerdict[] }).verdicts,
        })
      } else
        path({
          plan: (await c.runtime.execute(OPS[current.kind].plan, { model: row.id })) as
            FoundryModelPlan | LiteRtModelPlan,
        })
      change({ stage: 'review', busy: false })
      await engineSetupAction('setup-path-install', ctx)
    })
  }
  if (id === 'setup-path-install' && current.plan) {
    const plan = current.plan
    return run(async () => {
      if (plan.blockers.length) throw new Error(plan.blockers.join(' '))
      change({ stage: 'download' })
      const requestId = `terminal-${randomUUID()}`
      await c.runtime.execute(OPS[current.kind].install, {
        request_id: requestId,
        plan_digest: plan.digest,
      })
      const job: EngineSetupJob = {
        id: requestId,
        kind: OPS[current.kind].job,
        engine: current.engine,
        model: 'variant_id' in plan ? plan.variant_id : plan.repository,
      }
      await c.setup.savePath(job)
      path({ job })
      change({ stage: 'download', startedAt: Date.now() })
      focus('setup-path-abandon')
      if (returnToConnection(ctx, { model: job.model, provider: job.engine, downloading: true })) return
      if (get().firstRun === 'model')
        update((s) => ({
          ...s,
          firstRun: 'permissions',
          page: 'welcome',
          selected: 0,
          focus: 'first-permission:notifications',
        }))
    })
  }
  if (id === 'setup-path-resume' && current.job) {
    const job = current.job
    const digest = pathJob(view, get().workspace)?.digest
    return run(async () => {
      if (!digest) throw new Error('The server no longer knows this download; choose the model again.')
      await c.runtime.execute(JOB_INSTALL[job.kind], {
        request_id: job.id,
        plan_digest: digest,
      })
    })
  }
  if (id === 'setup-path-abandon') {
    // Let go of the record too: otherwise every later setup opens on this download.
    await c.setup.clearPath()
    change({ stage: 'engine', path: null, error: '' })
    focus(`setup-engine:${current.engine}`)
    return true
  }
  if (id === 'setup-path-finish' && current.job) {
    const job = current.job
    return run(async () => {
      await c.api(true, false)
      await c.runtime.execute('models.load', { provider: job.engine, model_id: job.model })
      await c.runtime.execute('setup.complete', { model_id: job.model })
      await c.setup.clearPath()
      await c.engineSelection.remember(job.engine)
      const endpoint = await c.localEndpoint()
      await c.unset('tui.endpoint')
      await c.save('tui.model', job.model)
      update((s) => ({
        ...s,
        firstRun: null,
        setupComplete: true,
        setup: null,
        model: job.model,
        engine: job.engine,
        endpoint,
        endpointFollowsServer: true,
        ...(view.destination ? {} : { page: 'server', serverView: 'connect', focus: 'copy-endpoint' }),
        message: view.destination ? '' : `${job.model} is running on ${job.engine}.`,
      }))
    })
  }
  return false
}
