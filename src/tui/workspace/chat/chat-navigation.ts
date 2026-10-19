import { COLORS, text } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { fill } from '../draw/fortress.js'

export function newChatButton(c: Canvas, x: number, y: number, width: number, focus: string) {
  const background = focus === 'new' ? COLORS.text : COLORS.gold
  fill(c, x, y, width, 1, background)
  text(c, x + 2, y, '+ New chat', COLORS.composerInk, width - 4, background, true)
  c.targets.push({ id: 'new', x, y, width, height: 1, hint: 'Ctrl+N New chat | Enter Open' })
}
