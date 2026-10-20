/**
 * What the Foundry Local panel's buttons do: the workspace operations of `atc engines accelerators` and
 * `atc models pull --engine foundry-local` — `foundry.accelerators`, `foundry.prepare` (after an
 * install too, as the command does), `models.search`, `foundry.plan`, `foundry.install`. A variant the
 * core cannot run yet leads back to the step that changes that: Prepare or Install.
 */

import { randomUUID } from 'node:crypto'
import type { FoundryAcceleratorsView, FoundryModelPlan } from '../../../contract/index.js'
import type { FoundrySearchResult } from '../../../workspace-service/index.js'
import type { ActionContext } from '../actions.js'
import type { EnginePanel } from './engine-panel-model.js'
import type { FoundryPanelData } from './foundry-panel-model.js'

type PanelContext = Pick<ActionContext, 'get' | 'update' | 'controller'>

function set(ctx: PanelContext, part: Partial<EnginePanel>, data: Partial<FoundryPanelData> = {}) {
  ctx.update((v) =>
    v.enginePanel
      ? {
          ...v,
          enginePanel: {
            ...v.enginePanel,
            ...part,
            foundry: { view: null, search: null, plan: null, ...v.enginePanel.foundry, ...data },
          },
        }
      : v
  )
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Read the library's accelerators again for the open panel. */
export async function refreshFoundry(ctx: PanelContext, seen: string): Promise<void> {
  set(ctx, { busy: true, seen })
  try {
    const view = (await ctx.controller.runtime.execute('foundry.accelerators')) as FoundryAcceleratorsView
    set(ctx, { busy: false }, { view })
  } catch (e) {
    set(ctx, { busy: false, error: message(e) })
  }
}

export async function foundryAction(id: string, ctx: PanelContext): Promise<boolean> {
  const p = ctx.get().enginePanel
  if (!p || p.kind !== 'foundry' || !id.startsWith('foundry-')) return false
  const run = ctx.controller.runtime
  const work = async (fn: () => Promise<void>) => {
    set(ctx, { busy: true, error: '', notice: '' })
    try {
      await fn()
      set(ctx, { busy: false })
    } catch (e) {
      set(ctx, { busy: false, error: message(e) })
    }
  }
  if (id === 'foundry-prepare' || id === 'foundry-install') {
    await work(async () => {
      if (id === 'foundry-install') await run.execute('engines.install', { engine: 'foundry-local' })
      set(ctx, {}, { view: (await run.execute('foundry.prepare', {})) as FoundryAcceleratorsView })
    })
    return true
  }
  if (id === 'foundry-models') {
    set(ctx, { mode: 'models' }, { plan: null })
    await work(async () =>
      set(
        ctx,
        {},
        { search: (await run.execute('models.search', { engine: 'foundry-local' })) as FoundrySearchResult }
      )
    )
    return true
  }
  if (id === 'foundry-models-back') return (set(ctx, { mode: 'engine', notice: '', error: '' }), true)
  if (id === 'foundry-plan-back') return (set(ctx, { notice: '', error: '' }, { plan: null }), true)
  if (id.startsWith('foundry-variant:')) {
    const [, model, variant] = id.split(':')
    const row = p.foundry?.search?.models.find((m) => m.model_id === model)
    const v = row?.variants.find((x) => x.id === variant)
    if (!row || !v) return true
    if (v.verdict.verdict === 'accelerator-not-prepared')
      return (
        set(ctx, {
          mode: 'engine',
          notice: `${v.id} runs on ${v.verdict.accelerator ?? 'an accelerator'} once it is prepared: Prepare accelerators.`,
        }),
        true
      )
    if (v.verdict.verdict === 'engine-not-installed')
      return (
        set(ctx, { mode: 'engine', notice: `Install Foundry Local first, then download ${v.id}.` }),
        true
      )
    await work(async () =>
      set(ctx, {}, { plan: (await run.execute('foundry.plan', { model, variant })) as FoundryModelPlan })
    )
    return true
  }
  if (id === 'foundry-download' && p.foundry?.plan) {
    const plan = p.foundry.plan
    await work(async () => {
      await run.execute('foundry.install', {
        request_id: `terminal-${randomUUID()}`,
        plan_digest: plan.digest,
      })
      ctx.update((v) => ({
        ...v,
        overlay: null,
        enginePanel: null,
        page: 'models',
        libraryView: 'downloads',
        message: `Downloading ${plan.variant_id} in the server.`,
      }))
    })
    return true
  }
  return false
}
