import type { Canvas } from './draw/canvas.js'
import { button, COLORS, text } from './draw/canvas.js'
import type { WorkspaceState } from './state.js'
import { computeRowWindow } from '../row-window.js'
export function drawReference(
  c: Canvas,
  s: WorkspaceState,
  b: { x: number; y: number; width: number; bottom: number },
  focus: string
): void {
  text(c, b.x, b.y, 'Command reference', COLORS.gold)
  const win = computeRowWindow(s.commands.length, s.selected, b.bottom - b.y - 3)
  s.commands
    .slice(win.start, win.start + win.count)
    .forEach((row, i) =>
      button(
        c,
        `command:${win.start + i}`,
        b.x,
        b.y + 2 + i,
        `atc ${row.path.join(' ')}  /  ${row.status}`.slice(0, b.width - 2),
        `${row.spec.summary}. Enter opens help. Up/Down browses.`,
        focus
      )
    )
  button(c, 'examples', b.x, b.bottom, 'Connection example', 'Show a curl request for this API.', focus)
}
