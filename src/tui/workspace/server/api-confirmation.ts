import { COLORS, text } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { actionButton, panel } from '../draw/cards.js'
import type { WorkspaceState } from '../state.js'

/** API confirmation owns its surface; the shared footer provides the single Escape action. */
export function drawApiConfirmation(c: Canvas, s: WorkspaceState, focus: string) {
  const width = Math.min(62, c.width - 8),
    height = 12,
    x = Math.floor((c.width - width) / 2),
    y = Math.max(3, Math.floor((c.height - 3 - height) / 2))
  c.targets = []
  panel(c, x, y, width, height)
  c.popover = { x, y, width, height }
  const restart = s.edit === 'api-restart'
  text(
    c,
    x + 3,
    y + 2,
    restart ? 'Restart API?' : 'Stop accepting API requests?',
    COLORS.text,
    width - 6,
    undefined,
    true
  )
  text(c, x + 3, y + 4, 'Active requests may be interrupted.', COLORS.muted, width - 6)
  text(c, x + 3, y + 5, 'Loaded models stay available.', COLORS.muted, width - 6)
  const label = restart ? 'Restart API' : 'Stop API'
  actionButton(
    c,
    'stop-confirm',
    x + width - label.length - 9,
    y + height - 4,
    label,
    'Active requests may be interrupted',
    focus
  )
}
