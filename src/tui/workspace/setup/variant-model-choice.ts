/** Engine onboarding keeps every device variant visible and plans only the explicit choice. */
import type { FoundryModelPlan, LiteRtModelPlan } from '../../../contract/index.js'
import { variantLabel, liteRtVariantLabel } from '../../../workspace-view/index.js'
import type { ActionContext } from '../actions.js'
import { randomUUID } from 'node:crypto'
import { engineAction } from '../library/engine-actions.js'

type Context = Pick<ActionContext, 'get' | 'update' | 'controller'>
interface Variant {
  id: string
  label: string
  size_bytes: number | null
  verdict: { verdict: string; reason: string | null }
}
export interface VariantModelChoice {
  engine: 'foundry-local' | 'litert-lm'
  model: string
  name: string
  variants: Variant[]
  selected: number
  windowCursor: number
  busy: boolean
  submitting?: boolean
  request?: { digest: string; id: string }
  error: string
}

export async function openVariantModelChoice(ctx: Context, model: string, preferred?: string) {
  const engine = ctx.get().setup?.engine === 'litert-lm' ? 'litert-lm' : 'foundry-local'
  const pending: VariantModelChoice = {
    engine,
    model,
    name: model,
    variants: [],
    selected: 0,
    windowCursor: 0,
    busy: true,
    error: '',
  }
  ctx.update((s) => ({
    ...s,
    overlay: 'variant-model-choice',
    focus: 'variant-choice-refresh',
    variantModelChoice: pending,
  }))
  const current = () =>
    ctx.get().overlay === 'variant-model-choice' && ctx.get().variantModelChoice === pending
  try {
    const result = (await ctx.controller.runtime.execute('models.search', {
      engine,
      query: model,
    })) as {
      models: Array<{
        model_id: string
        name: string
        default_variant: string | null
        variants: Array<
          Variant & {
            device: string
            execution_provider: string
            backend: string
            npu?: string
            file: { size: number }
          }
        >
      }>
    }
    const row = result.models.find((m) => m.model_id === model)
    if (!row?.variants.length)
      throw new Error('No device variants are available for this model. Refresh or choose another model.')
    const selected = Math.max(
      0,
      row.variants.findIndex((v) => v.id === (preferred ?? row.default_variant))
    )
    if (current())
      ctx.update((s) => ({
        ...s,
        focus: `variant-choice:${selected}`,
        variantModelChoice: {
          engine,
          model,
          name: row.name,
          variants: row.variants.map((v) => ({
            ...v,
            label: engine === 'litert-lm' ? liteRtVariantLabel(v) : variantLabel(v),
            size_bytes: engine === 'litert-lm' ? v.file.size : v.size_bytes,
          })),
          selected,
          windowCursor: selected,
          busy: false,
          error: '',
        },
      }))
  } catch (e) {
    if (current())
      ctx.update((s) => ({
        ...s,
        variantModelChoice: {
          ...s.variantModelChoice!,
          busy: false,
          error: String(e instanceof Error ? e.message : e),
        },
      }))
  }
  return true
}
export async function variantModelChoiceAction(id: string, ctx: Context) {
  const view = ctx.get().variantModelChoice
  if (!view) return false
  if (
    id === 'close' &&
    ctx.get().overlay === 'engine-panel' &&
    ctx.get().enginePanel?.engine === view.engine &&
    ctx.get().firstRun === 'model'
  ) {
    ctx.update((s) => ({ ...s, enginePanel: null }))
    return openVariantModelChoice(ctx, view.model, view.variants[view.selected]?.id)
  }
  if (ctx.get().overlay !== 'variant-model-choice') return false
  if (id === 'close') {
    if (!view.submitting)
      ctx.update((s) => ({ ...s, overlay: null, variantModelChoice: null, focus: 'first-model-continue' }))
    return true
  }
  if (!id.startsWith('variant-choice')) return false
  if (view.busy) return true
  if (id === 'variant-choice-refresh')
    return openVariantModelChoice(ctx, view.model, view.variants[view.selected]?.id)
  if (id.startsWith('variant-choice-page:')) {
    const windowCursor = Number(id.slice('variant-choice-page:'.length))
    ctx.update((s) => ({
      ...s,
      focus: `variant-choice:${windowCursor}`,
      variantModelChoice: { ...view, windowCursor },
    }))
    return true
  }
  if (id.startsWith('variant-choice:')) {
    const selected = Number(id.slice('variant-choice:'.length))
    if (view.variants[selected])
      ctx.update((s) => ({ ...s, variantModelChoice: { ...view, selected, error: '' } }))
    return true
  }
  if (id === 'variant-choice-prepare') return engineAction(`engine-open:${view.engine}`, ctx)
  const variant = view.variants[view.selected]
  if (id !== 'variant-choice-download' || !variant || variant.verdict.verdict !== 'ok') return true
  const kind = view.engine === 'litert-lm' ? 'litert' : 'foundry'
  let request = view.request
  ctx.update((s) => ({ ...s, variantModelChoice: { ...view, busy: true, submitting: true, error: '' } }))
  try {
    const plan = (await ctx.controller.runtime.execute(`${kind}.plan`, {
      model: view.model,
      variant: variant.id,
    })) as FoundryModelPlan | LiteRtModelPlan
    if (plan.blockers.length) throw new Error(plan.blockers.join(' '))
    if (request?.digest !== plan.digest) request = { digest: plan.digest, id: `terminal-${randomUUID()}` }
    await ctx.controller.runtime.execute(`${kind}.install`, {
      request_id: request.id,
      plan_digest: plan.digest,
    })
    const job = {
      id: request.id,
      kind: (kind === 'litert' ? 'litert-model' : 'foundry-model') as 'litert-model' | 'foundry-model',
      engine: view.engine,
      model: plan.variant_id,
    }
    await ctx.controller.setup.savePath(job)
    await ctx.controller.save('tui.model', plan.variant_id)
    ctx.update((s) => ({
      ...s,
      setup: {
        ...s.setup!,
        stage: 'download',
        startedAt: Date.now(),
        error: '',
        path: { ...s.setup!.path!, plan, job },
      },
      model: plan.variant_id,
      firstRun: 'permissions',
      page: 'welcome',
      selected: 0,
      focus: 'first-permission:notifications',
      overlay: null,
      variantModelChoice: null,
    }))
  } catch (e) {
    ctx.update((s) => ({
      ...s,
      variantModelChoice: {
        ...view,
        ...(request ? { request } : {}),
        busy: false,
        submitting: false,
        error: e instanceof Error ? e.message : String(e),
      },
    }))
  }
  return true
}
