import { COLORS, text } from './canvas.js'
import type { Canvas } from './canvas.js'
import { drawBrandMark } from './brand-mark.js'
import { INTRO_WORDMARK, SERVER_WORDMARK } from './brand-lettering.js'

export function drawIntroBrand(c: Canvas, seconds = 0, motion = true, prompt = 'Press any key') {
  const full = c.height >= 32 && c.width >= 76,
    medium = c.height >= 22 && c.width >= 44,
    size = full ? 'large' : medium ? 'compact' : 'small',
    markWidth = full ? 38 : medium ? 27 : 13,
    markHeight = full ? 16 : medium ? 11 : 4,
    top = full ? 2 : 1
  drawBrandMark(c, Math.floor((c.width - markWidth) / 2), top, size, 'welcome', seconds, motion, true)
  const wordmark =
    c.height >= 24 && c.width >= 88
      ? INTRO_WORDMARK
      : c.height >= 24 && c.width >= 75
        ? SERVER_WORDMARK
        : ['A T O M I C   S E R V E R']
  const titleY = Math.min(
    c.height - (medium && !full ? 6 : 8) - wordmark.length,
    top + markHeight + (full ? 4 : 2)
  )
  for (const [i, line] of wordmark.entries())
    text(c, Math.floor((c.width - line.length) / 2), titleY + i, line, COLORS.text)
  if (c.width >= 44 && c.height >= 22) {
    for (const row of [1, c.height - 2]) {
      text(c, 2, row, '+---', COLORS.muted)
      text(c, c.width - 6, row, '---+', COLORS.muted)
    }
    for (const row of [2, c.height - 3]) {
      text(c, 2, row, '|', COLORS.muted)
      text(c, c.width - 3, row, '|', COLORS.muted)
    }
  }
  const cursor = !motion || Math.floor(seconds * 1.5) % 2 === 0 ? '_' : ' '
  const label = `[ ${prompt} ${cursor} ]`
  text(c, Math.max(0, Math.floor((c.width - label.length) / 2)), c.height - 4, label, COLORS.text)
}
