/** One catalog read path; only the latest selection may publish rows, errors or completion. */
import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type { EngineId } from '@atomic-chat/core/contracts'
import type { ActionContext } from '../actions.js'
import type { WorkspaceState } from '../state.js'
import { withInstalledRows } from './catalog-installed.js'
import { isVariantFormat, loadVariantCatalog } from './catalog-variants.js'
import type { LibraryRow } from './library-model.js'
import { libraryRows, record } from './library-model.js'
import { saveCatalogPreferences } from './catalog-preferences.js'

const reads = new WeakMap<object, number>()
export function invalidateCatalogRead(ctx: ActionContext) {
  reads.set(ctx.controller, (reads.get(ctx.controller) ?? 0) + 1)
}
async function readRows(ctx: ActionContext, s: WorkspaceState, refresh: boolean) {
  const format = s.libraryFormat
  if (s.libraryCategory === 'text' && isVariantFormat(format))
    return { rows: await loadVariantCatalog(ctx, format) }
  const managed = s.libraryEngines.filter((e) => ENGINE_KINDS[e as EngineId] === 'managed')
  const engines = s.catalogFilters.engine ? managed.filter((e) => e === s.catalogFilters.engine) : managed
  if (s.libraryCategory !== 'text' || format !== 'safetensors' || !engines.length) {
    const result = await ctx.controller.runtime.execute('models.catalog', {
      category: s.libraryCategory,
      query: s.libraryQuery,
      refresh,
    })
    return { rows: libraryRows(result, 'catalog'), error: String(record(result)['error'] ?? '') }
  }
  const outcomes = await Promise.all(
    engines.map(async (engine) => {
      const result = record(
        await ctx.controller.runtime.execute(s.libraryQuery ? 'models.search' : 'models.catalog', {
          engine,
          ...(s.libraryQuery ? { query: s.libraryQuery } : {}),
        })
      )
      const rows = (
        Array.isArray(result['models'])
          ? result['models']
          : Array.isArray(result['rows'])
            ? result['rows']
            : []
      ).map(record)
      return rows.map((r) => ({
        id: String(r['repository']),
        name: String(r['repository']),
        category: 'text',
        description: String(r['note'] ?? r['section'] ?? 'safetensors'),
        source: { format: 'safetensors', engine, providers: [engine] },
      }))
    })
  )
  const merged = new Map<string, LibraryRow>()
  for (const row of outcomes.flat()) {
    const previous = merged.get(row.id)
    if (previous) (previous.source!['providers'] as string[]).push(row.source.engine)
    else merged.set(row.id, row)
  }
  return { rows: [...merged.values()] }
}
export function catalogReadGuard(ctx: ActionContext) {
  const revision = reads.get(ctx.controller)
  const initial = ctx.get()
  return () =>
    reads.get(ctx.controller) === revision &&
    ctx.get().page === initial.page &&
    ctx.get().libraryView === initial.libraryView &&
    ctx.get().libraryCategory === initial.libraryCategory &&
    ctx.get().libraryFormat === initial.libraryFormat &&
    ctx.get().libraryQuery === initial.libraryQuery
}
export async function readCatalog(ctx: ActionContext, refresh = false) {
  invalidateCatalogRead(ctx)
  const initial = ctx.get()
  const fresh = catalogReadGuard(ctx)
  ctx.update((s) => ({
    ...s,
    busy: true,
    libraryRows: [],
    catalogOpen: '',
    catalogVariants: [],
    catalogVariant: '',
    selected: 0,
    message: '',
  }))
  try {
    await saveCatalogPreferences(ctx)
    if (!fresh()) return
    if (!initial.libraryEngines.length) {
      const engines = await ctx.controller.setup.engines()
      if (!fresh()) return
      ctx.update((s) => ({ ...s, libraryEngines: engines }))
    }
    const result = await readRows(ctx, ctx.get(), refresh)
    if (fresh())
      ctx.update((s) => ({
        ...s,
        libraryRows: withInstalledRows(result.rows, s),
        message: result.error ?? '',
      }))
  } catch (error) {
    if (fresh())
      ctx.update((s) => ({ ...s, message: error instanceof Error ? error.message : String(error) }))
  } finally {
    if (fresh()) ctx.update((s) => ({ ...s, busy: false }))
  }
}
