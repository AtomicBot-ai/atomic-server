/** Returning from an engine panel rechecks catalog verdicts instead of retaining pre-install actions. */
import type { ActionContext } from '../actions.js'
import { readCatalog, catalogReadGuard } from './catalog-read.js'
import { catalogBrowseAction } from './catalog-browse.js'
import { catalogIndexes } from './catalog-filters.js'
import { isVariantFormat } from './catalog-variants.js'

export async function returnToEngineCatalog(id: string, ctx: ActionContext): Promise<boolean> {
  const s = ctx.get()
  if (
    id !== 'close' ||
    s.overlay !== 'engine-panel' ||
    s.page !== 'models' ||
    s.libraryView !== 'catalog' ||
    !isVariantFormat(s.libraryFormat)
  )
    return false
  const open = s.catalogOpen,
    variant = s.catalogVariant
  ctx.update((v) => ({
    ...v,
    overlay: null,
    enginePanel: null,
    edit: '',
    focus: 'library:catalog',
    hover: '',
  }))
  const reading = readCatalog(ctx)
  const fresh = catalogReadGuard(ctx)
  await reading
  if (!fresh() || ctx.get().overlay || ctx.get().message || !open) return true
  const index = catalogIndexes(ctx.get()).findIndex((i) => ctx.get().libraryRows[i]?.id === open)
  if (index >= 0) {
    await catalogBrowseAction(`catalog-row:${index}`, ctx)
    if (fresh() && ctx.get().catalogOpen === open)
      ctx.update((v) => ({
        ...v,
        focus: `catalog-row:${index}`,
        catalogVariant: v.catalogVariants.some((item) => item.value === variant) ? variant : v.catalogVariant,
      }))
  }
  return true
}
