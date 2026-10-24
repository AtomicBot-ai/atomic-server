/**
 * Guided setup with a managed engine or Foundry Local (spec managed-models-server, foundry-local-server):
 * the same workspace operations as `atc models pull --engine`. An engine not installed yet is installed
 * first in its engine panel, which then offers "Choose models >". The Models step lists the engine's
 * curated models (or a search); Review shows the core's verdict and the download plan; the download is
 * the server's durable job, followed from the snapshot and recorded so a reopened terminal finds it;
 * Ready loads the model with that engine.
 */

import { randomUUID } from 'node:crypto'
import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type { EngineId } from '@atomic-chat/core/contracts'
import type {
  FoundryModelPlan,
  ManagedModelPlan,
  ManagedVerdict,
  WorkspaceSnapshot,
} from '../../../contract/index.js'
import type {
  EngineSetupJob,
  EngineSetupPath,
  EngineSetupRow,
  SetupView,
} from '../../../terminal-setup/index.js'
import { formatSize } from '../../../workspace-view/index.js'
import type { ActionContext } from '../actions.js'
import { engineAction } from '../library/engine-actions.js'
import { returnToConnection } from '../server/connection-model-return.js'

type Context = Pick<ActionContext, 'controller' | 'get' | 'update'>

/** An engine setup takes this path for: a managed engine or Foundry Local. */
export const pathKind = (engine: string): EngineSetupPath['kind'] | null =>
  ENGINE_KINDS[engine as EngineId] === 'managed' ? 'managed' : engine === 'foundry-local' ? 'foundry' : null

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

async function rows(
  c: Context['controller'],
  path: EngineSetupPath,
  query: string
): Promise<EngineSetupRow[]> {
  if (path.kind === 'foundry') {
    const found = (await c.runtime.execute('models.search', { engine: 'foundry-local', query })) as {
      models: Array<{ model_id: string; name: string; default_variant: string | null; unverified: boolean }>
    }
    return found.models.map((m) => ({
      id: m.model_id,
      title: m.name,
      detail: `${m.default_variant ?? 'no variant runs here'}${m.unverified ? ' · unverified' : ''}`,
    }))
  }
  if (query) {
    const found = (await c.runtime.execute('models.search', { engine: path.engine, query })) as {
      rows: Array<{ repository: string; section: string; weight_bytes_estimate: number | null }>
    }
    return found.rows.map((r) => ({
      id: r.repository,
      title: r.repository,
      detail: r.weight_bytes_estimate ? `about ${formatSize(r.weight_bytes_estimate)}` : r.section,
    }))
  }
  const curated = (await c.runtime.execute('models.catalog', { engine: path.engine })) as {
    models: Array<{ repository: string; note: string; vram_tier_bytes: number }>
  }
  return curated.models.map((m) => ({
    id: m.repository,
    title: m.repository,
    detail: `${m.note}${m.vram_tier_bytes ? ` · ${formatSize(m.vram_tier_bytes)} GPU` : ''}`,
  }))
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
    if (!view.installed.includes(engine)) return openPanel(engine)
    change({ engine, stage: 'models', query: '', path: { engine, kind, rows: [], plan: null, job: null } })
    return run(async () => {
      path({ rows: await rows(c, get().setup!.path!, '') })
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
  // A variant that waits on Foundry Local itself: its panel installs it or prepares the accelerator.
  if (id === 'setup-path-foundry') return openPanel('foundry-local')
  if (id === 'setup-search' && view.stage === 'models')
    return run(async () => path({ rows: await rows(c, current, view.query) }))
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
      } else path({ plan: (await c.runtime.execute('foundry.plan', { model: row.id })) as FoundryModelPlan })
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
      await c.runtime.execute(current.kind === 'managed' ? 'managed.install' : 'foundry.install', {
        request_id: requestId,
        plan_digest: plan.digest,
      })
      const job: EngineSetupJob = {
        id: requestId,
        kind: current.kind === 'managed' ? 'managed-model' : 'foundry-model',
        engine: current.engine,
        model: 'variant_id' in plan ? plan.variant_id : plan.repository,
      }
      await c.setup.savePath(job)
      path({ job })
      change({ stage: 'download', startedAt: Date.now() })
      focus('setup-cancel')
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
      await c.runtime.execute(job.kind === 'managed-model' ? 'managed.install' : 'foundry.install', {
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
      await c.save('tui.endpoint', endpoint)
      await c.save('tui.model', job.model)
      update((s) => ({
        ...s,
        firstRun: null,
        setupComplete: true,
        setup: null,
        model: job.model,
        engine: job.engine,
        endpoint,
        ...(view.destination ? {} : { page: 'server', serverView: 'connect', focus: 'copy-endpoint' }),
        message: view.destination ? '' : `${job.model} is running on ${job.engine}.`,
      }))
    })
  }
  return false
}
