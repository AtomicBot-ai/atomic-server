/** Terminal equivalents of desktop fields, switches, navigation rows and scroll tracks. */
import { COLORS, text, textWidth } from './canvas.js'
import { actionButton } from './cards.js'
import type { Canvas } from './canvas.js'

export function fieldControl(
  c: Canvas,
  id: string,
  x: number,
  y: number,
  width: number,
  value: string,
  hint: string,
  focus: string,
  dropdown = false
) {
  const active = focus === id
  const edge = active ? COLORS.gold : COLORS.stone
  text(c, x, y, ' '.repeat(width), COLORS.text, width, active ? COLORS.focus : COLORS.header)
  text(c, x, y, '[', edge, 1)
  text(c, x + 2, y, value, COLORS.text, width - (dropdown ? 7 : 4))
  if (dropdown) text(c, x + width - 4, y, 'v', active ? COLORS.gold : COLORS.muted, 1)
  text(c, x + width - 1, y, ']', edge, 1)
  c.targets.push({ id, x, y, width, height: 1, hint })
}

export function toggleControl(
  c: Canvas,
  id: string,
  x: number,
  y: number,
  on: boolean,
  hint: string,
  focus: string
) {
  const active = focus === id
  const surface = active ? COLORS.composer : on ? COLORS.gold : COLORS.header
  text(c, x, y, on ? '[= On ]' : '[Off =]', active || on ? COLORS.ground : COLORS.muted, 7, surface, true)
  c.targets.push({ id, x, y, width: 7, height: 1, hint })
}

export function navigationRow(
  c: Canvas,
  id: string,
  x: number,
  y: number,
  width: number,
  label: string,
  focus: string,
  selected = false,
  hint = label
) {
  const active = focus === id
  const surface = active || selected ? COLORS.focus : COLORS.surface
  text(c, x, y, ' '.repeat(width), COLORS.text, width, surface)
  text(c, x, y, active || selected ? '|' : ' ', COLORS.gold, 1)
  text(c, x + 2, y, label, active || selected ? COLORS.text : COLORS.muted, width - 3, surface, selected)
  c.targets.push({ id, x, y, width, height: 1, hint })
}

export function scrollTrack(
  c: Canvas,
  x: number,
  y: number,
  height: number,
  start: number,
  count: number,
  total: number
) {
  if (height < 2 || total <= count) return
  const thumb = Math.max(1, Math.floor((height * count) / total))
  const top = Math.round(((height - thumb) * start) / Math.max(1, total - count))
  for (let row = 0; row < height; row++)
    text(
      c,
      x,
      y + row,
      row >= top && row < top + thumb ? '#' : '|',
      row >= top && row < top + thumb ? COLORS.muted : COLORS.line,
      1
    )
}

export function quietButton(
  c: Canvas,
  id: string,
  x: number,
  y: number,
  label: string,
  hint: string,
  focus: string
) {
  const width = textWidth(label) + 2
  text(
    c,
    x,
    y,
    ` ${label} `,
    focus === id ? COLORS.text : COLORS.muted,
    width,
    focus === id ? COLORS.focus : COLORS.surface
  )
  c.targets.push({ id, x, y, width, height: 1, hint })
}

/** Desktop save bar: the secondary action precedes the primary at the trailing edge. */
export function saveActions(
  c: Canvas,
  x: number,
  bottom: number,
  width: number,
  focus: string,
  save = 'settings-save',
  discard = 'settings-discard',
  hint = 'Apply these settings'
) {
  const saveX = x + width - 18
  if (width >= 64) text(c, x, bottom - 1, 'Unsaved changes', COLORS.muted, width - 32)
  quietButton(c, discard, saveX - 11, bottom - 1, 'Discard', 'Discard pending settings', focus)
  actionButton(c, save, saveX, bottom - 2, 'Save changes', hint, focus)
}
