/**
 * What the LiteRT-LM panel's buttons do: the workspace operations of `atc engines install|accelerators
 * litert-lm` and `atc models pull --engine litert-lm` — `engines.install` then `litert.prepare` where the
 * core offers an accelerator (as the command does), `litert.accelerators`, `models.search`, `litert.plan`,
 * `litert.install`. A variant the core cannot run yet leads back to the step that changes that.
 */

import { randomUUID } from 'node:crypto'
import type { LiteRtAcceleratorsView, LiteRtModelPlan, LiteRtSearchResult } from '../../../contract/index.js'
import type { ActionContext } from '../actions.js'
import type { EnginePanel } from './engine-panel-model.js'
import type { LiteRtPanelData } from './litert-panel-model.js'

type PanelContext = Pick<ActionContext, 'get' | 'update' | 'controller'>

function set(ctx: PanelContext, part: Partial<EnginePanel>, data: Partial<LiteRtPanelData> = {}) {
  ctx.update((v) =>
    v.enginePanel
      ? {
          ...v,
          enginePanel: {
            ...v.enginePanel,
            ...part,
            litert: { view: null, search: null, plan: null, ...v.enginePanel.litert, ...data },
          },
        }
      : v
  )
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Read the accelerator again for the open panel. */
export async function refreshLiteRt(ctx: PanelContext, seen: string): Promise<void> {
  set(ctx, { busy: true, seen })
  try {
    const view = (await ctx.controller.runtime.execute('litert.accelerators')) as LiteRtAcceleratorsView
    set(ctx, { busy: false }, { view })
  } catch (e) {
    set(ctx, { busy: false, error: message(e) })
  }
}

export async function liteRtAction(id: string, ctx: PanelContext): Promise<boolean> {
  const p = ctx.get().enginePanel
  if (!p || p.kind !== 'litert' || !id.startsWith('litert-')) return false
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
  if (id === 'litert-prepare' || id === 'litert-install' || id === 'litert-update') {
    await work(async () => {
      if (id !== 'litert-prepare') await run.execute('engines.install', { engine: 'litert-lm' })
      const view = (await run.execute('litert.accelerators')) as LiteRtAcceleratorsView
      // Only an accelerator the core offers here (openvino on an Intel NPU): Linux and macOS have none.
      const wanted = view.accelerators.some((a) => !a.prepared)
      set(
        ctx,
        {},
        { view: wanted ? ((await run.execute('litert.prepare', {})) as LiteRtAcceleratorsView) : view }
      )
    })
    return true
  }
  if (id === 'litert-models') {
    set(ctx, { mode: 'models', notice: '' }, { plan: null })
    await work(async () =>
      set(
        ctx,
        {},
        { search: (await run.execute('models.search', { engine: 'litert-lm' })) as LiteRtSearchResult }
      )
    )
    return true
  }
  if (id === 'litert-models-back') return (set(ctx, { mode: 'engine', notice: '', error: '' }), true)
  if (id === 'litert-plan-back') return (set(ctx, { notice: '', error: '' }, { plan: null }), true)
  if (id.startsWith('litert-variant:')) {
    const [, model, variant] = id.split(':')
    const row = p.litert?.search?.models.find((m) => m.model_id === model)
    const v = row?.variants.find((x) => x.id === variant)
    if (!row || !v) return true
    if (v.verdict.verdict === 'accelerator-not-prepared')
      return (
        set(ctx, {
          mode: 'engine',
          notice: `${v.id} runs on the NPU once openvino is prepared: Prepare accelerator.`,
        }),
        true
      )
    if (v.verdict.verdict === 'engine-not-installed')
      return (set(ctx, { mode: 'engine', notice: `Install LiteRT-LM first, then download ${v.id}.` }), true)
    await work(async () =>
      set(ctx, {}, { plan: (await run.execute('litert.plan', { model, variant })) as LiteRtModelPlan })
    )
    return true
  }
  if (id === 'litert-download' && p.litert?.plan) {
    const plan = p.litert.plan
    await work(async () => {
      await run.execute('litert.install', {
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
