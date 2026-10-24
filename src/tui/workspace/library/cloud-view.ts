import type { Canvas } from '../draw/canvas.js'
import { text, button, COLORS, wrap, wrapWords } from '../draw/canvas.js'
import { actionButton, panel } from '../draw/cards.js'
import type { WorkspaceState } from '../state.js'
import { cloudChoices } from './cloud-catalog.js'
import { computeRowWindow } from '../../row-window.js'
import { fieldControl, scrollTrack } from '../draw/controls.js'
import { cloudListLayout } from './cloud-layout.js'
import { CLOUD_CATALOG, CLOUD_CONNECTION_NOTES } from '../../../contract/index.js'
export function drawCloudList(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string,
  seconds = 0
) {
  const choices = cloudChoices(s.cloud)
  const errors = !s.cloud.editing && s.cloud.error ? wrapWords(s.cloud.error, width).slice(0, 2) : []
  const { columns, rows, cardWidth } = cloudListLayout(width, bottom - y - errors.length)
  const current = focus.startsWith('cloud-choice:') ? Number(focus.slice(13)) : s.selected
  const win = computeRowWindow(Math.ceil(choices.length / columns), Math.floor(current / columns), rows)
  const start = win.start * columns
  choices.slice(start, start + win.count * columns).forEach((p, i) => {
    const id = `cloud-choice:${start + i}`
    const left = x + (i % columns) * (cardWidth + 1)
    const top = y + Math.floor(i / columns) * 3
    const connected = p.saved?.connected
    panel(c, left, top, cardWidth, 3, focus === id, seconds)
    if (connected)
      for (let row = top; row < top + 3; row++)
        for (let col = left; col < left + cardWidth; col++) {
          const cell = c.cells[row]?.[col]
          if (cell) {
            cell.background = COLORS.header
            cell.color = focus === id ? COLORS.gold : COLORS.stone
          }
        }
    text(c, left + 2, top + 1, p.name, connected ? COLORS.muted : COLORS.text, cardWidth - 4, undefined, true)
    text(c, left + 2, top, ` ${p.icon} `, connected ? COLORS.muted : COLORS.gold, 7)
    if (connected) text(c, left + cardWidth - 12, top, '[Connected]', COLORS.ground, 11, COLORS.muted, true)
    c.targets.push({
      id,
      x: left,
      y: top,
      width: cardWidth,
      height: 3,
      hint: `${connected ? 'Manage' : 'Configure'} ${p.name}`,
    })
  })
  scrollTrack(c, x + width - 1, y, rows * 3, win.start, win.count, Math.ceil(choices.length / columns))

  errors.forEach((line, i) => text(c, x, bottom - errors.length + i, line, COLORS.red, width))
  text(
    c,
    x,
    bottom,
    `${start + 1}–${Math.min(choices.length, start + win.count * columns)} of ${choices.length}`,
    COLORS.stone,
    width
  )
  if (errors.length)
    button(c, 'cloud-refresh', x + width - 9, bottom, 'Retry', 'Refresh cloud providers', focus)
}
/** Provider forms fit their controls; terminal height only caps the panel. */
export function drawCloud(c: Canvas, s: WorkspaceState, focus: string, seconds = 0) {
  const choices = cloudChoices(s.cloud)
  const custom = !choices.some((p) => p.id === s.cloud.provider && p.url)
  const fields = (custom ? 1 : 0) + 2 + (s.cloud.optionsOpen ? 2 : 0)
  const errors = s.cloud.error ? wrapWords(s.cloud.error, Math.min(58, c.width - 12)).slice(0, 2) : []
  const width = Math.min(s.cloud.editing ? 62 : 84, c.width - 8)
  const notes = wrap(CLOUD_CONNECTION_NOTES[s.cloud.provider] ?? '', width - 2).filter(Boolean)
  const noteHeight = notes.length ? notes.length + 1 : 0
  const height = s.cloud.editing
    ? Math.min(c.height - 6, 7 + fields * 2 + errors.length + noteHeight)
    : Math.min(c.height - 6, 5 + choices.length * 3)
  const x = Math.floor((c.width - width) / 2)
  const top = Math.max(3, Math.floor((c.height - 3 - height) / 2))
  const bottom = top + height - 1
  panel(c, x - 1, top, width + 2, height)
  c.popover = { x: x - 1, y: top, width: width + 2, height }
  c.targets = []
  text(
    c,
    x + 1,
    top + 1,
    s.cloud.editing
      ? `Connect ${choices.find((p) => p.id === s.cloud.provider)?.name || 'custom provider'}`
      : 'Cloud providers',
    COLORS.gold,
    width - 2
  )
  if (!s.cloud.editing) return drawCloudList(c, s, x + 1, top + 3, width - 2, bottom - 1, focus)
  let y = top + 3
  notes.forEach((line) => text(c, x + 1, y++, line, COLORS.muted, width - 2))
  if (notes.length) y++
  const gap = 7 + fields * 2 + errors.length + noteHeight <= height ? 2 : 1
  const b = (id: string, label: string, hint: string) => {
    if (id === 'cloud-options') button(c, id, x + 1, y, label, hint, focus)
    else fieldControl(c, id, x + 1, y, width - 2, label, hint, focus)
    y += gap
  }
  if (custom) b('cloud-provider', `Provider: ${s.cloud.provider || 'Custom provider'}`, 'Provider identifier')
  b(
    'cloud-key',
    `API key: ${s.cloud.key ? '••••••••' : 'Enter key'}`,
    'Your provider credential; characters are hidden'
  )
  b(
    'cloud-options',
    `Connection options ${s.cloud.optionsOpen ? '^' : 'v'}`,
    'Endpoint and optional model IDs'
  )
  if (s.cloud.optionsOpen) {
    b('cloud-url', `Base URL: ${s.cloud.url || 'Enter endpoint'}`, 'OpenAI-compatible endpoint')
    b(
      'cloud-models',
      `Model IDs: ${s.cloud.models || 'Discover automatically'}`,
      'Optional comma-separated model IDs'
    )
  }
  const actionY = bottom - 3
  errors.forEach((line, i) => text(c, x + 1, actionY - errors.length + i, line, COLORS.red, width - 2))
  if (s.cloud.checking) {
    c.targets = []
    text(
      c,
      x + 1,
      actionY + 1,
      `${['|', '/', '-', '\\'][Math.floor(seconds * 8) % 4]} Checking connection...`,
      COLORS.gold,
      width - 2
    )
    return
  }
  actionButton(
    c,
    'cloud-save',
    x + width - 14,
    actionY,
    'Connect',
    'Check the provider and save this connection',
    focus
  )
  const index = s.cloud.providers.findIndex((p) => p.provider === s.cloud.provider)
  if (index >= 0)
    button(c, `cloud-remove:${index}`, x + 1, actionY + 1, 'Disconnect', 'Remove this connection', focus)
}

export function drawCustomProviders(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  focus: string
) {
  const providers = s.cloud.providers.filter((p) => !CLOUD_CATALOG.some((c) => c.id === p.provider))
  text(c, x, y, 'Custom endpoints', COLORS.text, width, undefined, true)
  const focused = focus.startsWith('cloud-edit:')
    ? providers.findIndex((p) => s.cloud.providers.indexOf(p) === Number(focus.slice(11)))
    : 0
  const win = computeRowWindow(
    providers.length,
    Math.max(0, focused),
    Math.max(1, Math.floor((c.height - y - 8) / 4))
  )
  providers.slice(win.start, win.start + win.count).forEach((provider, i) => {
    const top = y + 2 + i * 4
    panel(c, x, top, width, 4)
    text(c, x + 2, top + 1, provider.provider, COLORS.text, width - 20, undefined, true)
    text(c, x + width - 16, top + 1, provider.connected ? '[Connected]' : 'Not checked', COLORS.muted, 14)
    text(c, x + 2, top + 2, provider.base_url ?? '', COLORS.muted, width - 4)
    c.targets.push({
      id: `cloud-edit:${s.cloud.providers.indexOf(provider)}`,
      x,
      y: top,
      width,
      height: 4,
      hint: 'Edit connection',
    })
  })
  button(
    c,
    'cloud-add',
    x,
    y + 3 + win.count * 4,
    providers.length ? 'Add another one' : 'Add endpoint',
    'Connect an OpenAI-compatible provider',
    focus
  )
}
