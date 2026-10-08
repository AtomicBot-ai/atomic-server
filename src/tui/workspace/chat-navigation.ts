import { COLORS, text } from './canvas.js'
import type { Canvas } from './canvas.js'
import { fill } from './fortress.js'

export function newChatButton(c: Canvas, x: number, y: number, width: number, tall: boolean, focus: string) {
  const background = focus === 'new' ? COLORS.text : COLORS.gold
  const height = tall ? 3 : 1
  fill(c, x, y, width, height, background)
  text(c, x + 2, y + (tall ? 1 : 0), '+ New chat', COLORS.composerInk, width - 4, background, true)
  c.targets.push({ id: 'new', x, y, width, height, hint: 'Ctrl+N New chat | Enter Open' })
}
