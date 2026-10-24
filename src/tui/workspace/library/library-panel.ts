import { drawCloudList, drawCustomProviders } from './cloud-view.js'
import { drawCatalogBrowser } from './catalog-browser.js'
import { installedModelRows } from './installed-model-rows.js'
import { drawDownloadCard } from '../setup/download-card.js'
import { card } from '../draw/cards.js'
import { downloadRows, verdictLine } from '../../../workspace-view/index.js'
import type { ManagedVerdict } from '../../../contract/index.js'

import { button, COLORS, text } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { computeRowWindow } from '../../row-window.js'
import { bytes } from '../setup/setup-panel.js'
export function drawLibrary(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  if (s.libraryView === 'endpoint') return drawCustomProviders(c, s, x, y, width, focus)
  if (s.libraryView === 'cloud') {
    text(c, x, y, 'Cloud providers', COLORS.text, width, undefined, true)
    return drawCloudList(c, s, x, y + 2, width, bottom - 1, focus)
  }
  if (s.libraryView === 'catalog') return drawCatalogBrowser(c, s, x, y, width, bottom, focus)
  let bx = x
  const row = y
  if (s.libraryView === 'installed') {
    const items = installedModelRows(s)
    const win = computeRowWindow(items.length, s.selected, Math.max(1, bottom - row - 1))
    items.slice(win.start, win.start + win.count).forEach((v, i) => {
      button(
        c,
        v.id,
        x,
        row + i,
        `${v.name.slice(0, Math.max(1, width - (v.remove ? 12 : 2) - v.status.length - 3))} [${v.status}]`,
        'Load this model | GPU models may be unloaded',
        focus
      )
      if (v.remove) button(c, v.remove, x + width - 10, row + i, 'X Delete', 'Delete this model', focus)
    })
    if (!items.length) text(c, x, row, 'No model installed. Browse Catalog to add one.', COLORS.muted, width)
  } else if (s.libraryView === 'downloads') {
    const items = downloadRows(s.workspace?.setups ?? [], s.workspace?.downloads ?? [], true)
    const win = computeRowWindow(items.length, s.selected, Math.max(1, Math.floor((bottom - row) / 5)))
    items
      .slice(win.start, win.start + win.count)
      .forEach((_, i) => drawDownloadCard(c, s, x, row + i * 5, width, win.start + i, focus, true))
    if (!items.length) text(c, x, row, 'No downloads.', COLORS.muted, width)
  } else {
    const indices = s.libraryRows.map((_, i) => i)
    const h = bottom - row >= 6 ? 3 : 1
    const win = computeRowWindow(indices.length, s.selected, Math.max(1, Math.floor((bottom - row - 1) / h)))
    indices.slice(win.start, win.start + win.count).forEach((index, i) => {
      const v = s.libraryRows[index]!
      const id = `library-row:${index}`
      if (h === 1) button(c, id, x, row + i, v.name.slice(0, width - 2), v.description || v.id, focus)
      else
        card(c, {
          id,
          x,
          y: row + i * h,
          width,
          height: h,
          title: `${s.catalogLikes.includes(v.id) ? '* ' : ''}${v.name}`,
          icon: s.libraryView === 'engines' ? '[E]' : '[M]',
          detail: v.description || v.id,
          focus,
        })
    })
    if (!indices.length && s.libraryRows.length)
      text(c, x, row, 'No models match these filters.', COLORS.muted, width)
    if (!s.libraryRows.length)
      text(
        c,
        x,
        row,
        s.busy ? 'Reading catalog…' : 'No entries. Refresh or change category.',
        COLORS.muted,
        width
      )
  }
  bx = x
  for (const [id, label, hint] of [
    ['library-refresh', 'Refresh', 'Refresh live list'],
    ['library-search', 'Search', 'Search model catalogs'],
  ]) {
    bx += button(c, id!, bx, bottom, label!, hint!, focus) + 1
  }
}
export function drawInstallReview(c: Canvas, s: WorkspaceState, focus: string) {
  const x = 3,
    y = 3,
    width = c.width - 6,
    height = c.height - 6
  for (let i = y; i < y + height; i++) text(c, x, i, ' '.repeat(width), COLORS.text, width, COLORS.header)
  c.targets = []
  c.popover = { x, y, width, height }
  const p = s.libraryPlan ?? {}
  text(c, x + 2, y + 1, 'Review installation', COLORS.gold)
  if (s.libraryRequest['managed']) {
    // A store download for a managed engine: the core's verdict of every managed engine, the bytes, any blockers.
    const blockers = Array.isArray(p['blockers']) ? (p['blockers'] as string[]) : []
    const checked = s.libraryRequest['verdicts']
    const verdicts = Array.isArray(checked) ? (checked as ManagedVerdict[]) : [p['verdict'] as ManagedVerdict]
    const lines = [
      String(s.libraryRequest['repository'] ?? ''),
      ...verdicts.map(verdictLine),
      `Download: ${bytes(Number(p['download_bytes'] ?? 0))}`,
    ]
    ;[...lines, ...blockers].forEach((l, i) =>
      text(c, x + 2, y + 3 + i, l, i >= lines.length ? COLORS.red : COLORS.text, width - 4)
    )
    if (!blockers.length)
      button(c, 'library-install', x + 2, y + height - 3, 'Download', 'Download in the server', focus)
    button(c, 'close', x + 16, y + height - 3, 'Cancel', 'Return without downloading', focus)
    return
  }
  text(
    c,
    x + 2,
    y + 3,
    String(p['model_id'] ?? s.libraryRequest['model_id'] ?? s.libraryRequest['repo'] ?? ''),
    COLORS.text,
    width - 4
  )
  text(
    c,
    x + 2,
    y + 5,
    `Download: ${bytes(Number(p['total_download_bytes'] ?? p['total_bytes'] ?? 0))}`,
    COLORS.text,
    width - 4
  )
  const blockers = Array.isArray(p['blockers']) ? p['blockers'] : []
  text(
    c,
    x + 2,
    y + 7,
    blockers.length ? JSON.stringify(blockers) : 'Installs required engine and model files.',
    blockers.length ? COLORS.red : COLORS.muted,
    width - 4
  )
  if (!blockers.length)
    button(
      c,
      'library-install',
      x + 2,
      y + height - 3,
      'Download',
      'Start verified installation | Downloads continue in background',
      focus
    )
  button(c, 'close', x + 16, y + height - 3, 'Cancel', 'Return without downloading', focus)
}
