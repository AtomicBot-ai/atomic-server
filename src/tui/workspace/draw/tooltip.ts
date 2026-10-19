import { COLORS, text, textWidth } from './canvas.js'
import type { Canvas } from './canvas.js'

/** Shared presentation for contextual hints and shortcut rows. Preserve URLs and filenames. */
export function tooltip(c: Canvas, x: number, y: number, value: string, width: number, background?: string) {
  const parts = value
    .replace(/(?<!\.)\.(?!\.)\s+|\n+/g, ' | ')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\.$/, '')
    .split(' | ')
  let shown = ''
  for (const part of parts) {
    const next = shown ? `${shown} | ${part}` : part
    if (shown && textWidth(next) > width) break
    shown = next
  }
  text(c, x, y, shown, COLORS.stone, width, background)
}
