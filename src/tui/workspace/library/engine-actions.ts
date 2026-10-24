/**
 * What the managed engine panel's buttons do (design D16): the same workspace operations as `atc
 * engines install|rm` — `engines.plan` to read, `engines.operate` with the digest of the plan shown,
 * `engines.resume` for an operation that waits, `engines.cancel`, `engines.install` for an update. The
 * work runs in the server; closing the panel only stops showing it. After every action, and whenever the
 * live operation changes phase, the core's state is read again.
 */

import { randomUUID } from 'node:crypto'
import { AtomicCoreError } from '@atomic-chat/core'
import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import { LOCAL_PROVIDER_IDS } from '@atomic-chat/core/settings'
import { WORKSPACE_OPERATIONS } from '../../../contract/index.js'
import type { WorkspaceState } from '../state.js'
import { buildAction, readBuilds } from './engine-builds.js'
import { settingsAction, readEngineForm } from './engine-settings.js'
import { foundryAction, refreshFoundry } from './foundry-actions.js'
import type { EngineId } from '@atomic-chat/core/contracts'
import type { ManagedEngineState, ManagedInstallResult, ServerLaunch } from '../../../contract/index.js'
import type { ActionContext } from '../actions.js'
import { enginePanelModel, panelOperation, panelRefreshKey } from './engine-panel-model.js'
import type { EnginePanel } from './engine-panel-model.js'

export const isManagedEngine = (id: string) => ENGINE_KINDS[id as EngineId] === 'managed'

const requestId = () => `terminal-${randomUUID()}`

type PanelContext = Pick<ActionContext, 'get' | 'update' | 'controller'>

/** The operation runner on `engines.install` for an engine: its builds, as Library did before the panel. */
export function engineRunner(engine: string, source: unknown): Partial<WorkspaceState> {
  return {
    overlay: null,
    operations: [...WORKSPACE_OPERATIONS],
    toolGroup: 'engines',
    page: 'tools',
    operation: 'engines.install',
    operationInput: JSON.stringify({ engine }),
    operationReturn: 'models',
    operationResult: JSON.stringify(source, null, 2),
    focus: 'operation-run',
    selected: 0,
    edit: '',
    scroll: 0,
  }
}

/** Engines with settings in the core: every local provider; the panel opens for them. */
export const hasPanel = (id: string) =>
  (LOCAL_PROVIDER_IDS as readonly string[]).includes(id) || id in ENGINE_KINDS

export async function engineAction(id: string, ctx: PanelContext): Promise<boolean> {
  const { get, update, controller: c } = ctx
  if (await settingsAction(id, ctx)) return true
  if (await buildAction(id, ctx)) return true
  if (await foundryAction(id, ctx)) return true
  if (id.startsWith('engine-open:')) {
    const engine = id.slice('engine-open:'.length)
    const managed = isManagedEngine(engine)
    const kind = managed ? 'managed' : engine === 'foundry-local' ? 'foundry' : 'build'
    const started = await c.runtime.start().catch(() => ({ launch: 'terminal' as ServerLaunch }))
    update((v) => ({
      ...v,
      overlay: 'engine-panel',
      focus: 'engine-refresh',
      enginePanel: {
        engine,
        kind,
        summary: v.libraryRows.find((r) => r.id === engine)?.description ?? '',
        mode: 'engine',
        form: null,
        foundry: null,
        state: null,
        busy: kind !== 'build',
        error: '',
        notice: '',
        removing: false,
        keepModels: false,
        ...started,
        seen: '',
      },
    }))
    await refresh(ctx)
    const opened = get().enginePanel
    if (opened?.engine === engine) {
      await readBuilds(ctx).catch(() => {})
      try {
        if (engine !== 'sd-cpp') panel(ctx, engine, { form: await readEngineForm(ctx, opened) })
      } catch (error) {
        panel(ctx, engine, { error: error instanceof Error ? error.message : String(error) })
      }
    }
    return true
  }
  const s = get(),
    p = s.enginePanel
  if (s.overlay !== 'engine-panel' || !p || !id.startsWith('engine-')) return false
  const set = (part: Partial<EnginePanel>) => panel(ctx, p.engine, part)
  if (id === 'engine-refresh') {
    if (p.busy || p.updateCheck?.phase === 'checking') return true
    set({ error: '' })
    try {
      await readBuilds(ctx, true)
      await refresh(ctx)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
    return true
  }
  if (id === 'engine-builds') return readBuilds(ctx).then(() => true)
  if (id === 'engine-remove') return (set({ removing: true }), true)
  if (id === 'engine-remove-cancel') return (set({ removing: false }), true)
  if (id === 'engine-keep-models') return (set({ keepModels: !p.keepModels }), true)
  if (id === 'engine-update-cancel') return (set({ offer: null }), true)
  if (p.busy) return true
  const op = panelOperation(p, s.workspace)
  const approve = enginePanelModel(p, s.workspace).buttons.find((b) => b.id === 'engine-approve')
  const work: Record<string, () => Promise<unknown>> = {
    'engine-approve': () =>
      op?.phase === 'awaiting-consent'
        ? c.runtime.execute('engines.resume', {
            operation_id: op.operation_id,
            ...(approve?.digest ? { approved_plan_digest: approve.digest } : {}),
          })
        : c.runtime.execute('engines.operate', {
            engine: p.engine,
            kind: 'setup',
            request_id: requestId(),
            approved_plan_digest: approve!.digest,
          }),
    'engine-cancel': () => c.runtime.execute('engines.cancel', { operation_id: op!.operation_id }),
    'engine-resume': () => c.runtime.execute('engines.resume', { operation_id: op!.operation_id }),
    // The core's answer to an update is its plan; the reinstall waits for Agree (`approved_update`).
    'engine-update': async () => {
      const offer = (await c.runtime.execute('engines.install', {
        engine: p.engine,
        request: { request_id: requestId() },
      })) as ManagedInstallResult
      if (offer.status === 'update')
        set({ offer: { from: offer.from, target: offer.target, state: offer.state } })
    },
    'engine-update-confirm': async () => {
      await c.runtime.execute('engines.install', {
        engine: p.engine,
        request: { request_id: requestId(), approved_update: p.offer?.target },
      })
      set({ offer: null })
    },
    'engine-remove-confirm': () =>
      c.runtime.execute('engines.operate', {
        engine: p.engine,
        kind: 'remove',
        request_id: requestId(),
        retain_models: p.keepModels,
      }),
  }
  const run = work[id]
  if (
    !run ||
    (id === 'engine-approve' && !approve) ||
    (['engine-cancel', 'engine-resume'].includes(id) && !op)
  )
    return true
  set({ busy: true, error: '', notice: '' })
  try {
    await run()
    if (id === 'engine-remove-confirm') set({ removing: false })
  } catch (e) {
    if (e instanceof AtomicCoreError && e.code === 'MANAGED_PLAN_CHANGED')
      set({ notice: 'The plan changed since it was shown: review the new one and approve it again.' })
    else set({ error: e instanceof Error ? e.message : String(e) })
  }
  await refresh(ctx)
  return true
}

function panel(ctx: PanelContext, engine: string, part: Partial<EnginePanel>) {
  ctx.update((v) =>
    v.enginePanel?.engine === engine ? { ...v, enginePanel: { ...v.enginePanel, ...part } } : v
  )
}

/** Read the core's state for the open panel again, noting which live operation it was read for. */
async function refresh(ctx: PanelContext): Promise<void> {
  const p = ctx.get().enginePanel
  if (p?.kind === 'foundry') return refreshFoundry(ctx, panelRefreshKey(p, ctx.get().workspace))
  if (!p || p.kind !== 'managed') return
  panel(ctx, p.engine, { busy: true, seen: panelRefreshKey(p, ctx.get().workspace) })
  try {
    const state = (await ctx.controller.runtime.execute('engines.plan', {
      engine: p.engine,
    })) as ManagedEngineState
    panel(ctx, p.engine, { state, busy: false })
  } catch (e) {
    panel(ctx, p.engine, { busy: false, error: e instanceof Error ? e.message : String(e) })
  }
}
