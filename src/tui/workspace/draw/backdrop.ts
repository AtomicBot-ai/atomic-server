import { COLORS } from './canvas.js'
import type { Canvas } from './canvas.js'

const gray = (color: string) => {
  const value = Number.parseInt(color.slice(1), 16)
  const luminance = ((value >> 16) & 255) * 0.2126 + ((value >> 8) & 255) * 0.7152 + (value & 255) * 0.0722
  return `#${Math.round(luminance * 0.42)
    .toString(16)
    .padStart(2, '0')
    .repeat(3)}`
}

/** Preserve the page beneath a modal while muting text and bright button surfaces equally. */
export function dimBackdrop(c: Canvas) {
  for (const row of c.cells)
    for (const cell of row) {
      cell.color = gray(cell.color)
      cell.background = gray(cell.background ?? COLORS.ground)
      cell.bold = false
    }
}
