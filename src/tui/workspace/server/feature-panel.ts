import { drawProfiles, drawProfileMenu } from './profile-layout.js'
import { drawConnectorSettings, drawConnectorOverlay } from './connector-panel.js'
import { button, COLORS, text, wrap } from '../draw/canvas.js'
import { panel, actionButton } from '../draw/cards.js'
import { fieldControl, scrollTrack } from '../draw/controls.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { featureData, featureFields } from './feature-model.js'
export function drawFeatureSettings(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  if (drawProfiles(c, s, x, y, width, bottom, focus)) return
  if (s.settingsGroup === 'connectors') return drawConnectorSettings(c, s, x, y, width, bottom, focus)
  const data = featureData(s),
    kind = s.settingsGroup
  text(
    c,
    x,
    y,
    kind === 'connectors' ? 'MCP connectors' : kind[0]!.toUpperCase() + kind.slice(1),
    COLORS.text,
    width,
    undefined,
    true
  )
  if (kind === 'attachments') {
    actionButton(
      c,
      'feature-attachments',
      x,
      y + 2,
      'Edit settings',
      'Configure attachment processing',
      focus
    )
    Object.entries(data.attachments)
      .slice(s.scroll)
      .forEach(([key, value], i) => {
        if (y + 7 + i * 2 < bottom) {
          text(c, x, y + 7 + i * 2, key.replaceAll('_', ' '), COLORS.muted, width - 16)
          text(c, x + width - 14, y + 7 + i * 2, String(value), COLORS.text, 14)
        }
      })
    return
  }
  actionButton(
    c,
    'feature-add',
    x,
    y + 2,
    kind === 'assistants' ? 'Add assistant' : kind === 'connectors' ? 'Add connector' : 'Create new skill',
    'Add',
    focus
  )
  if (kind === 'skills')
    button(c, 'feature-import', x + 23, y + 3, 'Upload skill', 'Import SKILL.md or a .skill package', focus)
  let top = y + 7
  const rows =
    kind === 'assistants'
      ? data.assistants.map((a) => ({ id: a.id, name: a.name, description: a.description }))
      : kind === 'connectors'
        ? data.connectors.map((a) => ({
            id: a.id,
            name: a.name,
            description:
              data.connector_status[a.id]?.error ??
              `${data.connector_status[a.id]?.state ?? 'Disconnected'} · ${data.connector_status[a.id]?.tools.length ?? 0} tools`,
          }))
        : data.skills.map((a) => ({ id: a.name, name: a.name, description: a.description }))
  if (!rows.length)
    text(c, x, top, kind === 'skills' ? 'No skills installed.' : 'No connectors yet.', COLORS.muted, width)
  const capacity = Math.max(1, Math.floor((bottom - top) / 7)),
    offset = Math.min(s.scroll, Math.max(0, rows.length - capacity))
  for (const row of rows.slice(offset, offset + capacity)) {
    panel(c, x, top, width, 6)
    text(c, x + 2, top + 1, row.name, COLORS.text, width - 4, undefined, true)
    text(c, x + 2, top + 2, row.description, COLORS.muted, width - 4)
    button(c, `feature-edit:${row.id}`, x + 2, top + 4, 'Edit', 'Edit', focus)
    if (kind === 'assistants')
      button(
        c,
        `feature-default:${row.id}`,
        x + 10,
        top + 4,
        data.default_assistant === row.id ? 'Default' : 'Make default',
        'Default for new chats',
        focus
      )
    if (kind === 'connectors')
      button(
        c,
        `feature-connect:${row.id}`,
        x + 10,
        top + 4,
        s.busy ? 'Connecting…' : 'Connect',
        'Connect and list tools',
        focus
      )
    if (kind === 'skills') {
      button(
        c,
        `feature-toggle:${row.id}`,
        x + 10,
        top + 4,
        data.skills.find((k) => k.name === row.id)?.enabled ? 'Disable' : 'Enable',
        'Enable skill',
        focus
      )
      button(
        c,
        `feature-export:${row.id}`,
        x + 23,
        top + 4,
        'Export',
        'Save a portable .skill package',
        focus
      )
    }
    if (row.id !== 'atomic-chat')
      button(c, `feature-delete:${row.id}`, x + width - 12, top + 4, 'Delete', 'Delete', focus)
    top += 7
  }
  scrollTrack(c, x + width - 1, y + 7, bottom - y - 7, offset, capacity, rows.length)
}
export function drawFeatureOverlay(c: Canvas, s: WorkspaceState, focus: string) {
  if (drawProfileMenu(c, s, focus)) return true
  if (drawConnectorOverlay(c, s, focus)) return true
  if (s.overlay !== 'feature-editor' && s.overlay !== 'feature-delete') return false
  const editor = s.featureEditor,
    chat = editor?.kind === 'chat-parameters',
    fields = editor ? featureFields(editor) : [],
    w = Math.min(chat ? 50 : 80, c.width - 8),
    h = chat
      ? c.height - 4
      : s.overlay === 'feature-delete'
        ? 9
        : Math.min(c.height - 6, fields.length * 3 + 8),
    x = chat ? c.width - w - 1 : Math.floor((c.width - w) / 2),
    y = chat ? 2 : Math.floor((c.height - h) / 2)
  c.targets = []
  c.popover = { x, y, width: w, height: h }
  for (let row = y; row < y + h; row++) text(c, x, row, ' '.repeat(w), COLORS.text, w, COLORS.surface)
  panel(c, x, y, w, h)
  if (s.overlay === 'feature-delete') {
    text(c, x + 2, y + 2, 'Delete this item?', COLORS.text, w - 4, undefined, true)
    button(c, 'close', x + 2, y + 6, 'Cancel', 'Cancel', focus)
    actionButton(c, 'feature-confirm-delete', x + w - 18, y + 5, 'Delete', 'Delete item', focus)
    return true
  }
  if (!editor) return true
  text(
    c,
    x + 2,
    y + 1,
    chat
      ? 'Run settings'
      : editor.kind === 'import'
        ? 'Upload a skill'
        : editor.kind === 'export'
          ? 'Download skill'
          : `Edit ${editor.kind}`,
    COLORS.text,
    w - 4,
    undefined,
    true
  )
  const capacity = Math.max(1, Math.floor((h - 7) / 3)),
    at = fields.findIndex(([key]) => `feature-field:${key}` === focus),
    offset = Math.max(0, Math.min(fields.length - capacity, at - capacity + 1))
  fields.slice(offset, offset + capacity).forEach(([key, label], i) => {
    text(c, x + 2, y + 3 + i * 3, label, COLORS.muted, w - 4)
    fieldControl(
      c,
      `feature-field:${key}`,
      x + 2,
      y + 4 + i * 3,
      w - 4,
      (editor.value[key] ?? '').replaceAll('\n', ' ↵ '),
      label,
      focus
    )
  })
  scrollTrack(c, x + w - 2, y + 3, h - 7, offset, capacity, fields.length)
  button(c, 'close', x + 2, y + h - 3, 'Cancel', 'Cancel', focus)
  actionButton(c, 'feature-save', x + w - 16, y + h - 4, s.busy ? 'Saving…' : 'Save', 'Save', focus)
  if (s.message)
    wrap(s.message, w - 5)
      .slice(0, 1)
      .forEach((line) => text(c, x + 3, y + h - 5, line, COLORS.muted, w - 6))
  return true
}
