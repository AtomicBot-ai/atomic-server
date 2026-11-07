/** One scrollable engine popup: build controls, settings and update actions. */
import { COLORS, text, textWidth, wrap } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { panel, actionButton } from '../draw/cards.js'
import { fieldControl, scrollTrack } from '../draw/controls.js'
import type { WorkspaceState } from '../state.js'
import { enginePanelModel } from './engine-panel-model.js'
import type { PanelLine } from './engine-panel-model.js'
import { computeRowWindow } from '../../row-window.js'
import { queuedInstallation } from './engine-install-progress.js'
import { parseSettingValue } from '../../../workspace-view/index.js'

const TONES: Record<PanelLine['tone'], string> = {
  title: COLORS.accent,
  text: COLORS.text,
  muted: COLORS.muted,
  warn: COLORS.accent,
  error: COLORS.statusError,
  command: COLORS.green,
}
export function drawEnginePanel(c: Canvas, s: WorkspaceState, focus: string, seconds = 0): void {
  const p = s.enginePanel
  if (!p) return
  const width = Math.min(104, c.width - 6)
  const descriptor = p.form?.descriptors.find((field) => s.edit === `engine-setting:${field.key}`)
  const parsed = descriptor ? parseSettingValue(descriptor, s.editValue) : null
  const model = enginePanelModel(
    descriptor && parsed && 'value' in parsed && p.form
      ? {
          ...p,
          form: { ...p.form, draft: { ...p.form.draft, [descriptor.key]: parsed.value } },
        }
      : p,
    s.workspace
  )
  const rows = model.lines.flatMap((line) =>
    wrap(line.text, width - 6).map((label) => ({ label, tone: line.tone, id: '', hint: '' }))
  )
  const content = [...rows, ...model.fields.map((field) => ({ ...field, tone: 'text' as const }))]
  const footer: Array<{ button: (typeof model.buttons)[number]; label: string; x: number; y: number }> = []
  let footerRows = 1,
    used = 0
  for (const button of model.buttons) {
    const label = wrap(button.label, width - 6)[0] ?? ''
    const size = textWidth(label) + 2
    if (used && used + size > width - 4) {
      footerRows++
      used = 0
    }
    footer.push({ button, label, x: used, y: footerRows - 1 })
    used += size + 1
  }
  const footerHeight = footerRows
  const height = Math.min(c.height - 6, Math.max(10, content.length + footerHeight + 4)),
    x = Math.floor((c.width - width) / 2),
    y = Math.floor((c.height - height) / 2)
  panel(c, x, y, width, height)
  if (p.installation || queuedInstallation(p, s.workspace))
    text(
      c,
      x + width - 4,
      y + 1,
      ['|', '/', '-', '\\'][Math.floor((s.motion ? seconds : 0) * 8) % 4]!,
      COLORS.accent
    )
  c.popover = { x, y, width, height }
  c.targets = []
  const room = Math.max(1, height - footerHeight - 4)
  const at = content.findIndex((item) => item.id === focus)
  const win = computeRowWindow(content.length, at < 0 ? 0 : at, room)
  content.slice(win.start, win.start + win.count).forEach((item, i) => {
    const top = y + 1 + i
    if (!item.id)
      text(c, x + 2, top, item.label, TONES[item.tone], width - 5, undefined, item.tone === 'title')
    else {
      const editing = s.edit === item.id
      const label = editing ? `${item.label.split(':')[0]}: ${s.editValue}_` : item.label
      fieldControl(c, item.id, x + 2, top, width - 5, label, item.hint, focus)
    }
  })
  scrollTrack(c, x + width - 2, y + 1, room, win.start, win.count, content.length)
  for (const { button, label, x: offset, y: row } of footer)
    actionButton(c, button.id, x + 2 + offset, y + height - footerHeight - 1 + row, label, button.hint, focus)
}
