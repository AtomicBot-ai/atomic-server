import type { ActionContext } from '../actions.js'
import type { WorkspaceState } from '../state.js'
import type { Canvas } from '../draw/canvas.js'
import { text, COLORS } from '../draw/canvas.js'
import { panel } from '../draw/cards.js'
import { drawDownloadCard, downloadCardHeight } from '../setup/download-card.js'
import { computeRowWindow } from '../../row-window.js'
import { workspaceDownloadRows } from './download-layout.js'

export function downloadListAction(id: string, ctx: ActionContext) {
  const s = ctx.get()
  if (id === 'download-more' || id === 'first-downloads') {
    if (s.overlay !== 'download-list')
      ctx.update((v) => ({
        ...v,
        downloadListReturn: { overlay: v.overlay, focus: v.focus, selected: v.selected },
        overlay: 'download-list',
        focus: 'download-row:0',
        selected: 0,
        hover: '',
      }))
    return true
  }
  if (id !== 'close' || s.overlay !== 'download-list') return false
  ctx.update((v) => ({
    ...v,
    ...v.downloadListReturn,
    overlay: v.downloadListReturn?.overlay ?? null,
    downloadListReturn: null,
    hover: '',
    message: '',
  }))
  return true
}

export function drawDownloadList(c: Canvas, s: WorkspaceState, focus: string) {
  const rows = workspaceDownloadRows(s)
  const step = downloadCardHeight(c.height) + 1
  const count = Math.max(1, Math.min(rows.length, Math.floor((c.height - 10) / step)))
  const height = Math.min(c.height - 4, 6 + Math.max(1, count) * step)
  const width = Math.min(86, c.width - 4)
  const x = Math.floor((c.width - width) / 2),
    y = Math.floor((c.height - height) / 2)
  panel(c, x, y, width, height)
  c.popover = { x, y, width, height }
  c.targets = []
  text(c, x + 2, y + 1, 'Downloads', COLORS.text, width - 14, undefined, true)
  const win = computeRowWindow(rows.length, s.selected, count)
  rows
    .slice(win.start, win.start + win.count)
    .forEach((_, i) =>
      drawDownloadCard(c, s, x + 2, y + 3 + i * step, width - 4, win.start + i, focus, false, rows)
    )
  if (!rows.length) text(c, x + 2, y + 3, 'No downloads.', COLORS.muted, width - 4)
  if (rows.length > count)
    text(
      c,
      x + 2,
      y + height - 2,
      `${win.start + 1}–${win.start + win.count} of ${rows.length} · ↑↓ Scroll`,
      COLORS.muted,
      width - 4
    )
}
