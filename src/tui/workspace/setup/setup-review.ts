import type { Canvas } from '../draw/canvas.js'
import { button, COLORS, text, wrap } from '../draw/canvas.js'
import type { SetupView } from '../../../terminal-setup/index.js'
import { bytes } from './setup-panel.js'

export function drawSetupReview(
  c: Canvas,
  view: SetupView,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  const selection = view.selections[0]
  if (!selection) return
  const plan = selection.plan as unknown as Record<string, unknown>
  const blockers = Array.isArray(plan['blockers']) ? plan['blockers'] : []
  text(c, x, y + 3, 'Review before downloading', COLORS.gold, width)
  text(c, x, y + 5, selection.plan.model_id, COLORS.text, width)
  text(c, x, y + 6, selection.request.file, COLORS.muted, width)
  text(
    c,
    x,
    y + 8,
    `Total download: ${bytes(Number(plan['total_download_bytes'] ?? plan['total_bytes'] ?? 0))}`,
    COLORS.text,
    width
  )
  const detail = blockers.length
    ? JSON.stringify(blockers)
    : 'Includes required engine and model files. Downloads can continue after closing the console.'
  wrap(detail, width)
    .slice(0, Math.max(1, bottom - y - 11))
    .forEach((line, i) => text(c, x, y + 10 + i, line, blockers.length ? COLORS.red : COLORS.muted, width))
  if (!blockers.length) button(c, 'setup-install', x, bottom, 'Download', 'Install the reviewed files', focus)
  button(c, 'setup-back', x + 13, bottom, 'Back', 'Return without downloading', focus)
}
