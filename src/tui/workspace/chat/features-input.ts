import type { Key } from 'ink'
import type { WorkspaceState } from '../state.js'
import type { Canvas } from '../draw/canvas.js'
import type { InputResult } from '../input-types.js'
import { mouseReport } from '../input/mouse-report.js'
import { chatFeatureRows } from './features-list.js'

export function chatFeaturesInput(
  input: string,
  key: Key,
  s: WorkspaceState,
  frame: Canvas
): InputResult | undefined {
  if (s.overlay !== 'chat-features') return
  const mouse = mouseReport(input),
    wheel = mouse && mouse.code & 64
  if (wheel && !s.mouse) return {}
  if (!wheel && !(key.tab || key.upArrow || key.downArrow || key.pageUp || key.pageDown)) return
  const rows = chatFeatureRows(s)
      .map(([id]) => id)
      .filter(Boolean),
    controls = [...rows, ...frame.targets.map((t) => t.id).filter((id) => !rows.includes(id))],
    at = controls.indexOf(s.focus),
    delta = wheel ? (mouse.code & 1 ? 1 : -1) : key.upArrow || key.pageUp || (key.tab && key.shift) ? -1 : 1,
    step = key.pageUp || key.pageDown ? Math.max(1, (frame.popover?.height ?? 12) - 6) : 1,
    next =
      wheel || key.pageUp || key.pageDown
        ? Math.max(0, Math.min(controls.length - 1, at + delta * step))
        : (at + delta * step + controls.length) % controls.length
  return { patch: { focus: controls[next] ?? 'close', hover: '' } }
}
