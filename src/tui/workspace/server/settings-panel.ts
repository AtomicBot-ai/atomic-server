import { SETTING_LABELS, SETTINGS_SECTIONS } from '../../../contract/index.js'
import { button, COLORS, text } from '../draw/canvas.js'
import { fieldControl, toggleControl, scrollTrack, saveActions } from '../draw/controls.js'
import { panel } from '../draw/cards.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { settingsEntries } from './settings-model.js'
export { settingRows } from './settings-model.js'
export function drawSettings(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  text(
    c,
    x,
    y,
    SETTINGS_SECTIONS.find((g) => g.id === s.settingsGroup)?.label ?? 'Settings',
    COLORS.text,
    width,
    undefined,
    true
  )
  const rows = settingsEntries(s),
    height = 3
  const capacity = Math.max(1, Math.floor((bottom - y - 4) / height))
  const focused = rows.findIndex((r) => r.id === focus)
  const selected = Math.max(0, focused >= 0 ? focused : s.selected)
  const offset = Math.max(0, Math.min(selected - capacity + 1, rows.length - capacity))
  rows.slice(offset, offset + capacity).forEach((entry, i) => {
    const top = y + 2 + i * height,
      id = entry.id
    if (entry.kind === 'about') {
      text(c, x, top, 'About', COLORS.text, width, undefined, true)
      text(c, x, top + 1, 'Core version', COLORS.muted, width)
      text(
        c,
        x + Math.max(16, Math.floor(width / 2)),
        top + 1,
        entry.version,
        COLORS.text,
        Math.max(1, width - 16)
      )
      return
    }
    if (entry.kind !== 'field') {
      button(
        c,
        id,
        x,
        top,
        `${entry.kind === 'group' ? (entry.expanded ? '▾ ' : '▸ ') : ''}${entry.label}`,
        entry.kind === 'group' ? `${entry.expanded ? 'Collapse' : 'Expand'} ${entry.label}` : entry.label,
        focus
      )
      return
    }
    const r = entry.row
    const value = s.configDraft[r.path] ?? r.value
    const label = SETTING_LABELS[r.path] ?? r.path.split('.').at(-1) ?? r.path
    const wide = width >= 64,
      fieldX = wide ? x + Math.floor(width / 2) : x
    text(
      c,
      x,
      top,
      label,
      COLORS.text,
      r.type === 'boolean' ? width - 10 : wide ? Math.floor(width / 2) - 2 : width - 2,
      undefined,
      true
    )
    if (r.type === 'boolean') {
      toggleControl(c, id, x + width - 9, top, value === 'true', r.description || label, focus)
      if (wide) text(c, x, top + 1, r.description, COLORS.muted, width - 11)
    } else {
      fieldControl(
        c,
        id,
        fieldX,
        top + (wide ? 0 : 1),
        x + width - fieldX - 2,
        value || 'Not set',
        r.description || label,
        focus,
        r.type === 'enum'
      )
      if (wide) text(c, x, top + 1, r.description, COLORS.muted, width - 2)
    }
  })
  scrollTrack(c, x + width - 1, y + 2, capacity * height, offset, capacity, rows.length)
  if (rows.length > capacity)
    text(
      c,
      x,
      bottom - 3,
      `${offset + 1}–${Math.min(rows.length, offset + capacity)} of ${rows.length}`,
      COLORS.muted,
      width
    )
  if (!rows.length) text(c, x, y + 2, 'No settings available.', COLORS.muted, width)
  if (Object.keys(s.configDraft).length) {
    if (!s.busy) {
      saveActions(c, x, bottom, width, focus)
    } else text(c, x, bottom - 1, 'Saving…', COLORS.muted, width)
  } else {
    const links =
      s.settingsGroup === 'engines'
        ? [['library:engines', 'Inference engines']]
        : s.settingsGroup === 'managed'
          ? [['open-operation:environments.list', 'Environments']]
          : s.settingsGroup === 'log'
            ? [['page:logs', 'Open logs']]
            : []
    for (const [id, label] of links) button(c, id!, x, bottom, label!, label!, focus)
  }
}
export function drawInterfaceSettings(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  text(c, x, y, 'Interface', COLORS.text, width, undefined, true)
  const controls = [
    ['motion', 'Animation', s.motion, 'Animate the intro and selection cards'],
    ['mouse', 'Mouse navigation', s.mouse, 'Ctrl+X releases mouse capture for text selection'],
  ] as const
  controls.forEach(([id, title, value, hint], i) => {
    const top = y + 2 + i * 3
    text(c, x, top, title, COLORS.text, width - 10, undefined, true)
    toggleControl(c, id, x + width - 9, top, value, hint, focus)
    if (width >= 64) text(c, x, top + 1, hint, COLORS.muted, width - 2)
  })
  text(c, x, y + 8, 'Playground endpoint', COLORS.text, width - 2, undefined, true)
  fieldControl(
    c,
    'endpoint',
    x,
    y + 9,
    width - 2,
    s.endpoint,
    'Change the endpoint used for test requests',
    focus
  )
  button(c, 'page:commands', x, bottom, 'Command reference', 'Browse server commands', focus)
}
export function drawConfigChoice(c: Canvas, s: WorkspaceState, focus: string) {
  const row = s.base.config.rows.find((r) => `setting:${r.path}` === s.edit),
    options = row?.values ?? []
  const width = Math.min(54, c.width - 6),
    x = Math.floor((c.width - width) / 2),
    y = 3,
    height = Math.min(c.height - 7, Math.max(7, options.length + 5))
  const selected = Number(focus.slice(14)) || 0,
    count = height - 4
  const offset = Math.max(0, Math.min(selected - count + 1, options.length - count))
  panel(c, x, y, width, height)
  c.popover = { x, y, width, height }
  c.targets = []
  text(
    c,
    x + 2,
    y + 1,
    SETTING_LABELS[row?.path ?? ''] ?? 'Choose a value',
    COLORS.text,
    width - 4,
    undefined,
    true
  )
  options
    .slice(offset, offset + count)
    .forEach((value, i) =>
      button(
        c,
        `config-choice:${offset + i}`,
        x + 2,
        y + 3 + i,
        `${value === (s.configDraft[row!.path] ?? row?.value) ? '✓' : ' '} ${value}`.slice(0, width - 6),
        value,
        focus
      )
    )
}
