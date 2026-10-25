import { canvas, COLORS, text } from './canvas.js'
import type { Canvas } from './canvas.js'
import { drawBrandMark } from './brand-mark.js'
import type { BrandStatus } from './brand-mark.js'
import { SERVER_WORDMARK } from './brand-lettering.js'

/** Reserve the complete symmetric contour before any screen controls. */
export function brandHeaderRows(width: number, height: number) {
  return height < 24 ? 2 : width >= 100 && height >= 30 ? 6 : 5
}

export function workspaceHeaderRows(c: Canvas) {
  return c.contentTop ?? brandHeaderRows(c.width, c.height)
}

export function atomicHeader(
  c: Canvas,
  status: BrandStatus = 'welcome',
  seconds = 0,
  motion = true,
  availableWidth = c.width
) {
  if (c.height < 24) {
    const mark = canvas(13, 4)
    drawBrandMark(mark, 0, 0, 'small', status, seconds, motion)
    mark.cells[2]!.forEach((cell, x) => {
      c.cells[0]![x + 2] = { ...cell }
    })
    text(c, 18, 0, 'ATOMIC SERVER', COLORS.text, c.width - 20, undefined, true)
    return
  }
  const full = brandHeaderRows(availableWidth, c.height) === 6
  const title = full ? SERVER_WORDMARK : ['/ ATOMIC SERVER /']
  const markWidth = 13,
    titleWidth = Math.max(...title.map((line) => line.length)),
    gap = Math.min(3, Math.max(1, c.width - markWidth - titleWidth)),
    x = 2
  drawBrandMark(c, x, 1, full ? 'header' : 'small', status, seconds, motion)
  title.forEach((line, row) => text(c, x + markWidth + gap, (full ? 1 : 3) + row, line, COLORS.text))
}
