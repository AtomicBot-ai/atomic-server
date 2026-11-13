/** The frame every account dialog shares: a centred card, its lines and its button row. */
import { button, COLORS, text, wrap, wrapWords } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { actionButton, panel } from '../draw/cards.js'

export interface Dialog {
  x: number
  y: number
  w: number
  h: number
}

/** A centred card that owns every control while it is open. */
export function dialog(c: Canvas, width: number, height: number): Dialog {
  const w = Math.min(width, c.width - 6),
    h = Math.min(height, c.height - 6)
  const x = Math.floor((c.width - w) / 2),
    y = Math.floor((c.height - h) / 2)
  c.targets = []
  c.popover = { x, y, width: w, height: h }
  panel(c, x, y, w, h)
  return { x, y, w, h }
}

/** A row of buttons from `x`, the first one the primary action; ids with an empty label are skipped. */
export function buttonRow(
  c: Canvas,
  x: number,
  y: number,
  items: readonly (readonly [id: string, label: string, hint: string])[],
  focus: string
) {
  items.reduce(
    (at, [id, label, hint], i) =>
      at +
      1 +
      (i === 0 ? actionButton(c, id, at, y, label, hint, focus) : button(c, id, at, y, label, hint, focus)),
    x
  )
}

/** Lines in a dialog from its top, wrapped to its width and never into its button row. */
export function writer(c: Canvas, d: Dialog, from: number) {
  let row = from
  return {
    get row() {
      return row
    },
    skip: (n = 1) => void (row += n),
    put(value: string, color: string = COLORS.text, words = true, bold = false) {
      for (const line of (words ? wrapWords : wrap)(value, d.w - 4))
        if (row < d.h - 4) text(c, d.x + 2, d.y + row++, line, color, d.w - 4, undefined, bold)
    },
  }
}
