/** Desktop-style catalog filters operate on the live catalog without losing row identity. */
import type { WorkspaceState } from '../state.js'
import type { ActionContext } from '../actions.js'
import type { Canvas } from '../draw/canvas.js'
import { button, text, COLORS } from '../draw/canvas.js'
import { panel } from '../draw/cards.js'
import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type { EngineId } from '@atomic-chat/core/contracts'
import { libraryFormats, catalogAction } from './catalog-actions.js'
import { computeRowWindow } from '../../row-window.js'
import { engineName } from '../../../workspace-view/index.js'
import { catalogValue } from './catalog-table.js'
import { modelInstalled } from './model-job.js'
export interface CatalogFilters {
  engine: string
  downloaded: boolean
  uncensored: boolean
  liked: boolean
  sort: string
}
export const defaultFilters = (): CatalogFilters => ({
  engine: '',
  downloaded: false,
  uncensored: false,
  liked: false,
  sort: 'recommended',
})
export function catalogIndexes(s: WorkspaceState): number[] {
  const f = s.catalogFilters
  const indices = s.libraryRows.flatMap((row, i) => {
    const source = row.source ?? {},
      format = String(source['format'] ?? 'gguf')
    const engine = String(
      source['engine'] ??
        source['provider'] ??
        (format === 'mlx' ? 'mlx' : /bonsai|prism/i.test(row.id) ? 'atomic-prism' : 'llamacpp-upstream')
    )
    if (f.engine && engine !== f.engine && !(f.engine === 'llamacpp' && engine === 'llamacpp-upstream'))
      return []
    if (
      f.uncensored &&
      !/uncensored|abliterated/i.test(`${row.name} ${row.description} ${JSON.stringify(source)}`)
    )
      return []
    if (f.downloaded && !modelInstalled(s, row.id)) return []
    if (f.liked && !s.catalogLikes.includes(row.id)) return []
    if (s.libraryCategory === 'text' && s.libraryFormat === 'mlx' && format !== 'mlx') return []
    if (s.libraryCategory === 'text' && s.libraryFormat === 'gguf' && format === 'mlx') return []
    return [i]
  })
  if (f.sort.startsWith('column:')) {
    const [, key, direction] = f.sort.split(':')
    indices.sort((a, b) => {
      const left =
          key === 'device'
            ? Number(modelInstalled(s, s.libraryRows[a]!.id))
            : catalogValue(s.libraryRows[a]!, key!),
        right =
          key === 'device'
            ? Number(modelInstalled(s, s.libraryRows[b]!.id))
            : catalogValue(s.libraryRows[b]!, key!)
      if (left === undefined) return right === undefined ? 0 : 1
      if (right === undefined) return -1
      return (
        (typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), undefined, { numeric: true })) *
        (direction === 'asc' ? 1 : -1)
      )
    })
  } else if (f.sort !== 'recommended')
    indices.sort((a, b) => {
      const value = (i: number) => {
        const source = s.libraryRows[i]?.source ?? {}
        return f.sort === 'last-modified'
          ? Date.parse(String(source['last_modified'] ?? source['lastModified'] ?? '')) || 0
          : Number(source[f.sort] ?? 0)
      }
      return value(b) - value(a)
    })
  if (s.libraryCategory !== 'text')
    indices.sort(
      (a, b) =>
        Number(modelInstalled(s, s.libraryRows[b]!.id)) - Number(modelInstalled(s, s.libraryRows[a]!.id))
    )
  return indices
}
export async function catalogFilterAction(id: string, ctx: ActionContext) {
  const s = ctx.get()
  if (id === 'library-filters') {
    ctx.update((v) => ({ ...v, overlay: 'catalog-filters', focus: 'filter-engine:' }))
    return true
  }
  if (id === 'library-like') {
    const row = s.libraryRows[catalogIndexes(s)[s.selected] ?? -1]
    if (row) {
      const likes = s.catalogLikes.includes(row.id)
        ? s.catalogLikes.filter((v) => v !== row.id)
        : [...s.catalogLikes, row.id]
      await ctx.controller.saveCatalogLikes(likes)
      ctx.update((v) => ({ ...v, catalogLikes: likes }))
    }
    return true
  }
  if (!id.startsWith('filter-')) return false
  const f = { ...s.catalogFilters }
  if (id.startsWith('filter-format:')) {
    ctx.update((v) => ({ ...v, catalogFilters: { ...v.catalogFilters, engine: '' } }))
    await catalogAction(`format:${id.slice(14)}`, ctx)
    return true
  }
  if (id === 'filter-clear') {
    Object.assign(f, defaultFilters(), { sort: f.sort })
  } else if (id.startsWith('filter-engine:')) {
    f.engine = id.slice(14)
    ctx.update((v) => ({ ...v, catalogFilters: f }))
    if (f.engine) {
      const format =
        f.engine === 'mlx'
          ? 'mlx'
          : f.engine === 'foundry-local'
            ? 'foundry'
            : ENGINE_KINDS[f.engine as EngineId] === 'managed'
              ? 'safetensors'
              : 'gguf'
      await catalogAction(`format:${format}`, ctx)
    }
  } else if (id === 'filter-downloaded') f.downloaded = !f.downloaded
  else if (id === 'filter-uncensored') f.uncensored = !f.uncensored
  else if (id === 'filter-liked') f.liked = !f.liked
  ctx.update((v) => ({ ...v, catalogFilters: f, selected: 0 }))
  return true
}
export function catalogFilterControls(s: WorkspaceState): string[][] {
  const f = s.catalogFilters
  const engines = ['', ...new Set(['llamacpp-upstream', 'llamacpp', ...s.libraryEngines])]
  return [
    ...engines.map((engine) => [
      `filter-engine:${engine}`,
      `${f.engine === engine ? '(*)' : '( )'} ${engine ? engineName(engine) : 'All engines'}`,
    ]),
    ...libraryFormats(s.libraryEngines).map((format) => [
      `filter-format:${format}`,
      `${s.libraryFormat === format ? '(*)' : '( )'} Format: ${format.toUpperCase()}`,
    ]),
    ['filter-downloaded', `${f.downloaded ? '[x]' : '[ ]'} Installed on this device`],
    ['filter-liked', `${f.liked ? '[x]' : '[ ]'} Liked models`],
    ['filter-uncensored', `${f.uncensored ? '[x]' : '[ ]'} Uncensored`],
    ['filter-clear', 'Clear filters'],
  ]
}
export function drawCatalogFilters(c: Canvas, s: WorkspaceState, focus: string) {
  const width = Math.min(54, c.width - 8),
    x = Math.max(4, c.width - width - 4),
    y = 4
  panel(c, x, y, width, c.height - 8)
  c.popover = { x, y, width, height: c.height - 8 }
  c.targets = []
  text(c, x + 2, y + 1, 'Filter models', COLORS.gold, width - 4)
  const controls = catalogFilterControls(s)
  const win = computeRowWindow(
    controls.length,
    Math.max(
      0,
      controls.findIndex(([id]) => id === focus)
    ),
    c.height - 12
  )
  controls
    .slice(win.start, win.start + win.count)
    .forEach(([id, label], i) =>
      button(c, id!, x + 2, y + 3 + i, label!.slice(0, width - 6), 'Change this filter', focus)
    )
  text(c, x + 2, c.height - 5, `${catalogIndexes(s).length} matching models`, COLORS.muted, width - 4)
}
