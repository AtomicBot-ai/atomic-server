import type { ActionContext } from '../actions.js'
import type { FoundrySearchResult } from '../../../workspace-service/index.js'
import { engineAction } from './engine-actions.js'
import { record } from './library-model.js'
export async function loadFoundryCatalog(ctx: ActionContext) {
  const s = ctx.get()
  const result = (await ctx.controller.runtime.execute('models.search', {
    engine: 'foundry-local',
    ...(s.libraryQuery ? { query: s.libraryQuery } : {}),
  })) as FoundrySearchResult
  return (result.models ?? []).map((model) => ({
    id: model.model_id,
    name: model.name,
    description: model.summary,
    category: 'text',
    source: { ...model, format: 'foundry', engine: 'foundry-local' },
  }))
}
export function foundryNext(source: Record<string, unknown> | undefined, selected: string) {
  const variants = Array.isArray(source?.['variants']) ? source['variants'].map(record) : []
  const variant =
    variants.find((v) => v['id'] === selected) ??
    variants.find((v) => v['id'] === source?.['default_variant']) ??
    variants[0]
  const verdict = record(variant?.['verdict'])['verdict']
  return {
    variant,
    action:
      verdict === 'engine-not-installed'
        ? 'engine'
        : verdict === 'accelerator-not-prepared'
          ? 'prepare'
          : 'download',
  }
}
export async function foundryCatalogAction(id: string, ctx: ActionContext) {
  if (!id.startsWith('catalog-download:')) return false
  const s = ctx.get(),
    row = s.libraryRows[Number(id.slice(17))]
  if (row?.source?.['format'] !== 'foundry') return false
  const { variant, action } = foundryNext(row.source, s.catalogVariant)
  if (action === 'engine') return engineAction('engine-open:foundry-local', ctx)
  ctx.update((v) => ({ ...v, busy: true, message: '' }))
  try {
    if (action === 'prepare') {
      await ctx.controller.runtime.execute('foundry.prepare', {})
      const libraryRows = await loadFoundryCatalog(ctx)
      ctx.update((v) => ({ ...v, libraryRows }))
      return true
    }
    if (!variant) throw new Error('No compatible variant is available for this model.')
    const plan = record(
      await ctx.controller.runtime.execute('foundry.plan', { model: row.id, variant: variant['id'] })
    )
    if (Array.isArray(plan['blockers']) && plan['blockers'].length)
      throw new Error(plan['blockers'].join(' '))
    await ctx.controller.runtime.execute('foundry.install', {
      request_id: `terminal-${Date.now()}`,
      plan_digest: plan['digest'],
    })
    const workspace = await ctx.controller.runtime.snapshot()
    ctx.update((v) => ({ ...v, workspace, overlay: null, libraryView: 'catalog' }))
  } finally {
    ctx.update((v) => ({ ...v, busy: false }))
  }
  return true
}
