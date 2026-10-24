import type { ActionContext } from '../actions.js'
import type { Canvas } from '../draw/canvas.js'
import { button, COLORS, text } from '../draw/canvas.js'
import { panel } from '../draw/cards.js'
import type { WorkspaceState } from '../state.js'
import { CATEGORIES } from './library-model.js'
import { computeRowWindow } from '../../row-window.js'
export const CATEGORY_NAMES: Record<string, string> = {
  text: 'Text',
  image: 'Images',
  video: 'Video',
  embedding: 'Embeddings',
  decision: 'Decisions',
}
export const SORT_NAMES: Record<string, string> = {
  'recommended': 'Recommended',
  'downloads': 'Most downloaded',
  'last-modified': 'Recently updated',
  'likes': 'Most liked',
}
export function catalogMenuItems(s: WorkspaceState) {
  if (s.catalogMenu?.startsWith('media-')) {
    const category = s.catalogMenu.slice(6) as 'image' | 'video'
    return s.libraryRows.flatMap((row, index) =>
      row.category === category
        ? [
            {
              id: `media-select:${index}`,
              label: row.name,
              selected: s.setupMedia[category] === row.id,
            },
          ]
        : []
    )
  }
  if (s.catalogMenu === 'category')
    return CATEGORIES.map((category) => ({
      id: `category:${category}`,
      label: CATEGORY_NAMES[category]!,
      selected: s.libraryCategory === category,
    }))
  if (s.catalogMenu === 'variants')
    return s.catalogVariants.map((variant, i) => ({
      id: `catalog-variant:${i}`,
      label: variant.label,
      selected: s.catalogVariant === variant.value,
    }))
  return Object.entries(SORT_NAMES)
    .filter(([key]) => key !== 'likes' || s.libraryRows.some((row) => row.source?.['likes'] != null))
    .map(([key, label]) => ({ id: `catalog-sort:${key}`, label, selected: s.catalogFilters.sort === key }))
}
export async function catalogMenuAction(id: string, ctx: ActionContext) {
  if (id === 'catalog-category' || id === 'catalog-sort' || id === 'catalog-variants') {
    const menu = id.slice(8) as NonNullable<WorkspaceState['catalogMenu']>
    ctx.update((s) => {
      const next = { ...s, catalogMenu: menu, overlay: 'catalog-menu' as const }
      return {
        ...next,
        focus:
          catalogMenuItems(next).find((item) => item.selected)?.id ??
          catalogMenuItems(next)[0]?.id ??
          'close',
      }
    })
    return true
  }
  if (id.startsWith('catalog-column:')) {
    const column = id.slice(15)
    ctx.update((s) => ({
      ...s,
      catalogFilters: {
        ...s.catalogFilters,
        sort: `column:${column}:${s.catalogFilters.sort === `column:${column}:asc` ? 'desc' : 'asc'}`,
      },
      selected: 0,
    }))
    return true
  }
  if (id.startsWith('catalog-sort:')) {
    ctx.update((s) => ({
      ...s,
      catalogFilters: { ...s.catalogFilters, sort: id.slice(13) },
      overlay: null,
      selected: 0,
      focus: 'catalog-sort',
    }))
    return true
  }
  if (id.startsWith('catalog-variant:')) {
    ctx.update((s) => ({
      ...s,
      catalogVariant: s.catalogVariants[Number(id.slice(16))]?.value ?? '',
      overlay: null,
      focus: 'catalog-variants',
    }))
    return true
  }
  return false
}
export function drawCatalogMenu(c: Canvas, s: WorkspaceState, focus: string) {
  const items = catalogMenuItems(s),
    width = Math.min(64, c.width - 8),
    x = c.width - width - 3,
    y = 5
  const count = Math.min(items.length, c.height - y - 5),
    height = count + 4
  panel(c, x, y, width, height)
  c.popover = { x, y, width, height }
  c.targets = []
  text(
    c,
    x + 2,
    y + 1,
    s.catalogMenu === 'category'
      ? 'Model type'
      : s.catalogMenu === 'sort'
        ? 'Sort models'
        : s.catalogMenu === 'media-image'
          ? 'Image model'
          : s.catalogMenu === 'media-video'
            ? 'Video model'
            : 'Version',
    COLORS.gold,
    width - 4
  )
  const at = Math.max(
    0,
    items.findIndex((item) => item.id === focus)
  )
  const win = computeRowWindow(items.length, at, count)
  items
    .slice(win.start, win.start + win.count)
    .forEach((item, i) =>
      button(
        c,
        item.id,
        x + 2,
        y + 2 + i,
        `${item.selected ? '(*)' : '( )'} ${item.label}`.slice(0, width - 6),
        item.label,
        focus
      )
    )
}
