import { text, textWidth, COLORS } from './draw/canvas.js'
import type { Canvas } from './draw/canvas.js'
import type { WorkspaceState } from './state.js'
/** One clickable target per footer command, using the same action as its shortcut. */
export function drawFooter(c: Canvas, s: WorkspaceState, focus: string) {
  const rows =
    s.page === 'welcome'
      ? [
          ['hosting', '1 Set up'],
          ['setup-manual', '2 Manual'],
          ['agent-setup', '3 Agent'],
          ['quit', 'Ctrl+Q Quit'],
        ]
      : s.page === 'setup'
        ? [
            ['setup-manual', 'Skip setup'],
            ['agent-setup', 'Agent setup'],
            ['help', 'Ctrl+K Help'],
            ['quit', 'Ctrl+Q Quit'],
          ]
        : [
            ['help', 'Ctrl+K Help'],
            ['console', 'F4 Console'],
            ['menu', 'Ctrl+G Menu'],
            ['mouse', 'Ctrl+X Mouse'],
            ['quit', 'Ctrl+Q Quit'],
          ]
  let x = 2
  for (const [id, label] of rows) {
    const width = textWidth(label!)
    if (x + width > c.width - 2) break
    text(c, x, c.height - 1, label!, focus === id ? COLORS.gold : COLORS.stone, width)
    c.targets.push({ id: id!, x, y: c.height - 1, width, height: 1, hint: label! })
    x += width
    if (x + 3 < c.width - 2) text(c, x, c.height - 1, ' | ', COLORS.stone, 3)
    x += 3
  }
}
