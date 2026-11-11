import { catalogReadGuard } from './catalog-read.js'
import type { ActionContext } from '../actions.js'
import { engineAction } from './engine-actions.js'
import { record } from './library-model.js'

/**
 * The formats whose models are families of variants with the core's verdicts, read from their engine's
 * own catalog (Foundry Local's, LiteRT-LM's): a variant waiting on its engine opens the engine's panel,
 * one waiting on an accelerator prepares it in place, a runnable one downloads after its plan.
 */
const VARIANT_CATALOGS = {
  foundry: { engine: 'foundry-local', ops: 'foundry' },
  fastflowlm: { engine: 'fastflowlm', ops: 'fastflowlm' },
  geniex: { engine: 'geniex', ops: 'geniex' },
  litert: { engine: 'litert-lm', ops: 'litert' },
} as const
export type VariantFormat = keyof typeof VARIANT_CATALOGS
export const isVariantFormat = (format: unknown): format is VariantFormat =>
  typeof format === 'string' && format in VARIANT_CATALOGS

export async function loadVariantCatalog(ctx: ActionContext, format: VariantFormat) {
  const { engine } = VARIANT_CATALOGS[format]
  const s = ctx.get()
  const result = record(
    await ctx.controller.runtime.execute('models.search', {
      engine,
      ...(s.libraryQuery ? { query: s.libraryQuery } : {}),
    })
  )
  const models = Array.isArray(result['models']) ? result['models'].map(record) : []
  return models.map((model) => ({
    id: String(model['model_id']),
    name: String(model['name']),
    description: String(model['summary'] ?? ''),
    category: 'text',
    source: { ...model, format, engine },
  }))
}
export function variantNext(source: Record<string, unknown> | undefined, selected: string) {
  const variants = Array.isArray(source?.['variants']) ? source['variants'].map(record) : []
  const variant =
    variants.find((v) => v['id'] === selected) ??
    variants.find((v) => v['id'] === source?.['default_variant']) ??
    variants[0]
  const verdict = record(variant?.['verdict'])['verdict']
  return {
    variant,
    action: ['engine-not-installed', 'environment-not-ready', 'requires-newer-engine'].includes(
      String(verdict)
    )
      ? 'engine'
      : verdict === 'accelerator-not-prepared'
        ? 'prepare'
        : verdict === 'engine-update-required'
          ? 'review'
          : 'download',
  }
}
export async function variantCatalogAction(id: string, ctx: ActionContext) {
  if (!id.startsWith('catalog-download:')) return false
  const s = ctx.get(),
    row = s.libraryRows[Number(id.slice(17))],
    format = row?.source?.['format']
  if (!row || !isVariantFormat(format)) return false
  const { engine, ops } = VARIANT_CATALOGS[format]
  const { variant, action } = variantNext(row.source, s.catalogVariant)
  if (action === 'engine') return engineAction(`engine-open:${engine}`, ctx)
  const fresh = catalogReadGuard(ctx)
  ctx.update((v) => ({ ...v, busy: true, message: '' }))
  try {
    if (action === 'prepare') {
      await ctx.controller.runtime.execute(`${ops}.prepare`, {})
      if (!fresh()) return true
      const libraryRows = await loadVariantCatalog(ctx, format)
      if (fresh()) ctx.update((v) => ({ ...v, libraryRows }))
      return true
    }
    if (!variant) throw new Error('No compatible variant is available for this model.')
    const plan = record(
      await ctx.controller.runtime.execute(`${ops}.plan`, { model: row.id, variant: variant['id'] })
    )
    if (!fresh()) return true
    const blockers = Array.isArray(plan['blockers']) ? plan['blockers'].join(' ') : ''
    if (format === 'foundry' && plan['update_available'] === true) {
      await engineAction(`engine-open:${engine}`, ctx)
      const verdict = record(plan['verdict'])
      const notice = String(verdict['reason'] ?? blockers)
      if (fresh())
        ctx.update((v) => ({
          ...v,
          enginePanel: v.enginePanel?.engine === engine ? { ...v.enginePanel, notice } : v.enginePanel,
        }))
      return true
    }
    if (blockers) throw new Error(blockers)
    // One request per plan: a retry after a failed call continues the job the server may already hold.
    await ctx.controller.runtime.execute(`${ops}.install`, {
      request_id: `terminal-${String(plan['digest'])}`,
      plan_digest: plan['digest'],
    })
    const workspace = await ctx.controller.runtime.snapshot()
    if (fresh()) ctx.update((v) => ({ ...v, workspace, overlay: null, libraryView: 'catalog' }))
  } catch (error) {
    if (fresh()) throw error
  } finally {
    if (fresh()) ctx.update((v) => ({ ...v, busy: false }))
  }
  return true
}
