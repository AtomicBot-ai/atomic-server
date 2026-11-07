import type { WorkspaceState } from '../state.js'
import type { Canvas } from '../draw/canvas.js'
import { button, COLORS, text, wrap } from '../draw/canvas.js'
import { panel } from '../draw/cards.js'
import { computeRowWindow } from '../../row-window.js'
import { formatSize, engineVariantStatus, engineName } from '../../../workspace-view/index.js'

export function drawVariantModelChoice(c: Canvas, s: WorkspaceState, focus: string) {
  const view = s.variantModelChoice
  if (!view) return
  const width = Math.min(90, c.width - 6),
    height = Math.min(c.height - 4, 20),
    x = Math.floor((c.width - width) / 2),
    y = Math.floor((c.height - height) / 2)
  panel(c, x, y, width, height)
  c.targets = []
  c.popover = { x, y, width, height }
  text(c, x + 2, y + 1, `Run ${view.name} on`, COLORS.accent, width - 4)
  const win = computeRowWindow(view.variants.length, view.windowCursor, Math.max(1, height - 10))
  if (win.start > 0)
    button(
      c,
      `variant-choice-page:${win.start - 1}`,
      x + 2,
      y + 2,
      'Previous',
      'Show previous devices',
      focus
    )
  if (win.start + win.count < view.variants.length)
    button(
      c,
      `variant-choice-page:${Math.min(view.variants.length - 1, win.start + 2 * win.count - 1)}`,
      x + 16,
      y + 2,
      'Next',
      'Show more devices',
      focus
    )
  view.variants.slice(win.start, win.start + win.count).forEach((v, i) => {
    const index = win.start + i
    button(
      c,
      `variant-choice:${index}`,
      x + 2,
      y + 3 + i,
      `${view.selected === index ? '(o)' : '( )'} ${v.label} · ${v.size_bytes ? formatSize(v.size_bytes) : 'Size unknown'} · ${engineVariantStatus(v.verdict.verdict)}`.slice(
        0,
        width - 5
      ),
      v.verdict.reason ?? 'Choose this variant',
      focus
    )
  })
  const variant = view.variants[view.selected]
  const message =
    view.error || (view.busy ? `Checking ${engineName(view.engine)}…` : (variant?.verdict.reason ?? ''))
  wrap(message, width - 4)
    .slice(0, 3)
    .forEach((line, i) =>
      text(c, x + 2, y + height - 6 + i, line, view.error ? COLORS.statusError : COLORS.muted, width - 4)
    )
  if (!view.submitting) button(c, 'close', x + 2, y + height - 2, 'Back', 'Return to models', focus)
  if (!view.busy) {
    button(
      c,
      'variant-choice-refresh',
      x + 11,
      y + height - 2,
      'Refresh',
      'Read current accelerator readiness',
      focus
    )
    if (variant?.verdict.verdict === 'ok')
      button(c, 'variant-choice-download', x + 24, y + height - 2, 'Download', 'Download this variant', focus)
    else if (['engine-not-installed', 'accelerator-not-prepared'].includes(variant?.verdict.verdict ?? ''))
      button(
        c,
        'variant-choice-prepare',
        x + 24,
        y + height - 2,
        `Set up ${engineName(view.engine)}`,
        'Prepare the engine and accelerators',
        focus
      )
  }
}
