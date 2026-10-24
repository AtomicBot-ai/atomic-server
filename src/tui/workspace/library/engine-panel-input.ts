import type { Key } from 'ink'
import type { WorkspaceState } from '../state.js'
import type { InputResult } from '../input-types.js'
import { mouseReport } from '../mouse-report.js'
import { graphemes } from '../draw/canvas.js'
import { enginePanelModel } from './engine-panel-model.js'

/** Scroll all settings within the popup; editing never opens another screen. */
export function enginePanelInput(input: string, key: Key, s: WorkspaceState): InputResult | null {
  if (s.overlay !== 'engine-panel' || !s.enginePanel) return null
  const mouse = mouseReport(input)
  if (s.enginePanel.choice && key.escape) return { action: 'engine-choice-close' }
  const editing = s.edit.startsWith('engine-setting:')
  if (editing && !mouse) {
    if (key.escape) return { action: 'engine-setting-cancel' }
    if (key.return || key.tab) return { action: 'engine-setting-commit' }
    if (key.backspace || key.delete)
      return { patch: { editValue: graphemes(s.editValue).slice(0, -1).join('') } }
    if (key.ctrl && input === 'u') return { patch: { editValue: '' } }
    if (input && !key.ctrl && !key.meta)
      return { patch: { editValue: s.editValue + input.replace(/[\r\n]/g, '') } }
  }
  if (!(
    key.tab ||
    key.upArrow ||
    key.downArrow ||
    key.pageUp ||
    key.pageDown ||
    (mouse && s.mouse && mouse.code & 64)
  ))
    return null
  const model = enginePanelModel(s.enginePanel, s.workspace)
  const controls = [...model.fields, ...model.buttons]
  const at = controls.findIndex((item) => item.id === s.focus)
  const delta = key.upArrow || key.pageUp || (key.tab && key.shift) || (mouse && !(mouse.code & 1)) ? -1 : 1
  const step = key.pageUp || key.pageDown ? 5 : 1
  const next = key.tab
    ? (at + delta + controls.length) % controls.length
    : Math.max(0, Math.min(controls.length - 1, at + delta * step))
  return { patch: { focus: controls[next]?.id ?? 'close', hover: '' } }
}
