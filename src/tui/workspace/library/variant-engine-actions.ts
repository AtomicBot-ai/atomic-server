/**
 * What the Foundry Local and LiteRT-LM panels' buttons do — one flow, as `atc engines install|accelerators`
 * and `atc models pull --engine <engine>` run it: install the engine and prepare its accelerators, list
 * its models (`models.search`), plan a variant and install the plan. A variant the core cannot run yet
 * leads back to the step that changes that: Prepare or Install. The engines differ only in when they
 * prepare after an install and how they name a variant's accelerator.
 */

import type { ActionContext } from '../actions.js'
import type { EnginePanel } from './engine-panel-model.js'

type PanelContext = Pick<ActionContext, 'get' | 'update' | 'controller'>
type Kind = 'foundry' | 'litert'
interface Variant {
  id: string
  verdict: { verdict: string; accelerator?: string | null }
}
interface PanelData {
  view: unknown
  search: { models: Array<{ model_id: string; variants: Variant[] }> } | null
  plan: { digest: string; variant_id: string } | null
}

const ENGINES: Record<
  Kind,
  {
    engine: string
    label: string
    /** After an install or update: prepare its accelerators given what the core reports. */
    prepare: (view: unknown) => boolean
    waiting: (variant: Variant) => string
  }
> = {
  // A new Foundry Local build drops what the old one registered: an update prepares again, as an install does.
  foundry: {
    engine: 'foundry-local',
    label: 'Foundry Local',
    prepare: () => true,
    waiting: (v) =>
      `${v.id} runs on ${v.verdict.accelerator ?? 'an accelerator'} once it is prepared: Prepare accelerators.`,
  },
  // Only an accelerator the core offers here (openvino on an Intel NPU): Linux and macOS have none.
  litert: {
    engine: 'litert-lm',
    label: 'LiteRT-LM',
    prepare: (view) =>
      ((view as { accelerators?: Array<{ prepared: boolean }> }).accelerators ?? []).some((a) => !a.prepared),
    waiting: (v) => `${v.id} runs on the NPU once openvino is prepared: Prepare accelerator.`,
  },
}

const data = (p: EnginePanel, kind: Kind) => (p[kind] ?? null) as PanelData | null

function set(ctx: PanelContext, kind: Kind, part: Partial<EnginePanel>, next: Partial<PanelData> = {}) {
  ctx.update((v) =>
    v.enginePanel
      ? {
          ...v,
          enginePanel: {
            ...v.enginePanel,
            ...part,
            [kind]: { view: null, search: null, plan: null, ...data(v.enginePanel, kind), ...next },
          },
        }
      : v
  )
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const kindOf = (p: EnginePanel | null | undefined): Kind | null =>
  p?.kind === 'foundry' || p?.kind === 'litert' ? p.kind : null

/** Read the open panel's accelerators again. */
export async function refreshVariantEngine(ctx: PanelContext, seen: string): Promise<void> {
  const kind = kindOf(ctx.get().enginePanel)
  if (!kind) return
  set(ctx, kind, { busy: true, seen })
  try {
    const view = await ctx.controller.runtime.execute(`${kind}.accelerators`)
    set(ctx, kind, { busy: false }, { view })
  } catch (e) {
    set(ctx, kind, { busy: false, error: message(e) })
  }
}

export async function variantEngineAction(id: string, ctx: PanelContext): Promise<boolean> {
  const p = ctx.get().enginePanel,
    kind = kindOf(p)
  if (!p || !kind || !id.startsWith(`${kind}-`)) return false
  const { engine, label, prepare, waiting } = ENGINES[kind]
  const run = ctx.controller.runtime
  const work = async (fn: () => Promise<void>) => {
    set(ctx, kind, { busy: true, error: '', notice: '' })
    try {
      await fn()
      set(ctx, kind, { busy: false })
    } catch (e) {
      set(ctx, kind, { busy: false, error: message(e) })
    }
  }
  const step = id.slice(kind.length + 1)
  if (step === 'prepare' || step === 'install' || step === 'update') {
    await work(async () => {
      if (step !== 'prepare') await run.execute('engines.install', { engine })
      // Foundry Local prepares unasked; LiteRT-LM reads its accelerators first and prepares one offered.
      const view = kind === 'foundry' ? null : await run.execute(`${kind}.accelerators`)
      const wanted = prepare(view)
      set(ctx, kind, {}, { view: wanted ? await run.execute(`${kind}.prepare`, {}) : view })
    })
    return true
  }
  if (step === 'models') {
    set(ctx, kind, { mode: 'models', notice: '' }, { plan: null })
    await work(async () =>
      set(ctx, kind, {}, { search: (await run.execute('models.search', { engine })) as PanelData['search'] })
    )
    return true
  }
  if (step === 'models-back') return (set(ctx, kind, { mode: 'engine', notice: '', error: '' }), true)
  if (step === 'plan-back') return (set(ctx, kind, { notice: '', error: '' }, { plan: null }), true)
  if (step.startsWith('variant:')) {
    const [, model, variant] = step.split(':')
    const row = data(p, kind)?.search?.models.find((m) => m.model_id === model)
    const v = row?.variants.find((x) => x.id === variant)
    if (!row || !v) return true
    if (v.verdict.verdict === 'accelerator-not-prepared')
      return (set(ctx, kind, { mode: 'engine', notice: waiting(v) }), true)
    if (v.verdict.verdict === 'engine-not-installed')
      return (
        set(ctx, kind, { mode: 'engine', notice: `Install ${label} first, then download ${v.id}.` }),
        true
      )
    await work(async () =>
      set(
        ctx,
        kind,
        {},
        { plan: (await run.execute(`${kind}.plan`, { model, variant })) as PanelData['plan'] }
      )
    )
    return true
  }
  const plan = data(p, kind)?.plan
  if (step === 'download' && plan) {
    await work(async () => {
      // One request per plan: a retry after a failed call continues the job the server may already hold.
      await run.execute(`${kind}.install`, {
        request_id: `terminal-${plan.digest}`,
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
