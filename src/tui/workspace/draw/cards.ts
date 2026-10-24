/** Shared terminal cards: full-surface hit targets, clipped text and a quiet focus pulse. */
import { COLORS, text, textWidth, wrap } from './canvas.js'
import type { Canvas } from './canvas.js'
export function panel(
  c: Canvas,
  x: number,
  y: number,
  width: number,
  height: number,
  active = false,
  seconds = 0
) {
  const edge = active ? (Math.floor(seconds * 2) % 2 ? COLORS.green : COLORS.gold) : COLORS.line
  for (let row = 0; row < height; row++)
    text(c, x, y + row, ' '.repeat(width), COLORS.text, width, active ? COLORS.focus : COLORS.surface)
  text(c, x, y, '+' + '-'.repeat(Math.max(0, width - 2)) + '+', edge, width)
  text(c, x, y + height - 1, '+' + '-'.repeat(Math.max(0, width - 2)) + '+', edge, width)
  for (let row = 1; row < height - 1; row++) {
    text(c, x, y + row, '|', edge)
    text(c, x + width - 1, y + row, '|', edge)
  }
}
export function card(
  c: Canvas,
  o: {
    id: string
    x: number
    y: number
    width: number
    height: number
    title: string
    detail?: string
    icon?: string
    focus: string
    seconds?: number
    selected?: boolean
  }
) {
  const active = o.focus === o.id
  panel(c, o.x, o.y, o.width, o.height, active || o.selected, o.seconds)
  text(
    c,
    o.x + 2,
    o.y + 1,
    `${o.icon ?? '>'}  ${o.title}`,
    active ? COLORS.gold : COLORS.text,
    o.width - 4,
    undefined,
    true
  )
  if (o.height > 3 && o.detail)
    wrap(o.detail, o.width - 4)
      .slice(0, o.height - 3)
      .forEach((line, i) => text(c, o.x + 2, o.y + 2 + i, line, COLORS.muted, o.width - 4))
  c.targets.push({ id: o.id, x: o.x, y: o.y, width: o.width, height: o.height, hint: o.detail ?? o.title })
}
export { atomicHeader } from './brand-header.js'

/** A primary action occupies three rows, with a bright surface even before focus. */
export function actionButton(
  c: Canvas,
  id: string,
  x: number,
  y: number,
  label: string,
  hint: string,
  focus = ''
): number {
  const width = Math.min(c.width - x, textWidth(label) + 6)
  const background = focus === id ? COLORS.composer : COLORS.gold
  for (let row = 0; row < 3 && y + row < c.height; row++)
    text(c, x, y + row, ' '.repeat(Math.max(0, width)), COLORS.ground, width, background, true)
  text(c, x + 3, y + 1, label, COLORS.ground, width - 6, background, true)
  c.targets.push({ id, x, y, width, height: Math.min(3, c.height - y), hint })
  return width
}
