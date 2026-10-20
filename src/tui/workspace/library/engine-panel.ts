/** Draws the managed engine panel (`engine-panel-model.ts`) as a full overlay with its buttons below. */

import { button, COLORS, text, wrap } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { enginePanelModel } from './engine-panel-model.js'
import type { PanelLine } from './engine-panel-model.js'

const TONES: Record<PanelLine['tone'], string> = {
  title: COLORS.gold,
  text: COLORS.text,
  muted: COLORS.muted,
  warn: COLORS.gold,
  error: COLORS.red,
  command: COLORS.green,
}

export function drawEnginePanel(c: Canvas, s: WorkspaceState, focus: string): void {
  const p = s.enginePanel
  if (!p) return
  const x = 3,
    y = 2,
    width = c.width - 6,
    height = c.height - 4
  for (let i = y; i < y + height; i++) text(c, x, i, ' '.repeat(width), COLORS.text, width, COLORS.header)
  c.targets = []
  const { lines, buttons } = enginePanelModel(p, s.workspace)
  const rows = lines.flatMap((l) => wrap(l.text, width - 4).map((t) => ({ text: t, tone: l.tone })))
  const room = Math.max(1, height - 4)
  // Keep the end in view: the newest state and its instruction come last.
  rows.slice(Math.max(0, rows.length - room)).forEach((r, i) => {
    text(c, x + 2, y + 1 + i, r.text, TONES[r.tone], width - 4, COLORS.header, r.tone === 'title')
  })
  let bx = x + 2
  for (const b of buttons) {
    if (bx + b.label.length + 3 > x + width) break
    bx += button(c, b.id, bx, y + height - 2, b.label, b.hint, focus) + 1
  }
}
