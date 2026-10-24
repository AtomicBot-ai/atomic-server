import type { Key } from 'ink'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { COLORS, text, graphemes } from '../draw/canvas.js'
import { actionButton, panel } from '../draw/cards.js'
import { fieldControl, quietButton, scrollTrack } from '../draw/controls.js'
import { cloudChoices, cloudNeedsKey } from '../library/cloud-catalog.js'
import { cloudListLayout } from '../library/cloud-layout.js'
import { computeRowWindow } from '../../row-window.js'
import { CLOUD_CONNECTION_NOTES } from '../../../contract/index.js'

/** First run keeps provider cards and their form on the same screen, as on desktop. */
export function drawSetupCloud(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string,
  seconds: number
) {
  const choices = cloudChoices(s.cloud),
    current = choices.find((p) => p.id === s.cloud.provider) ?? {
      id: s.cloud.provider,
      name: 'Custom provider',
      saved: undefined,
    },
    options = s.cloud.optionsOpen,
    available = bottom - y,
    fieldHeight = available >= (options ? 12 : 9) ? 3 : 1,
    formHeight = (options ? 7 : 4) + fieldHeight - 1,
    cardHeight = available - formHeight >= 3 ? 3 : 1,
    { columns, cardWidth } = cloudListLayout(width, available),
    count = Math.max(1, Math.floor((available - formHeight) / cardHeight))
  const index = focus.startsWith('cloud-choice:') ? Number(focus.slice(13)) : s.selected,
    win = computeRowWindow(Math.ceil(choices.length / columns), Math.floor(index / columns), count)
  choices.slice(win.start * columns, (win.start + win.count) * columns).forEach((p, i) => {
    const at = win.start * columns + i,
      id = `cloud-choice:${at}`,
      left = x + (i % columns) * (cardWidth + 1),
      top = y + Math.floor(i / columns) * cardHeight,
      connected = Boolean(p.saved?.connected)
    if (cardHeight > 1)
      panel(c, left, top, cardWidth, cardHeight, focus === id || current.id === p.id, seconds)
    text(
      c,
      left + 1,
      top + (cardHeight > 1 ? 1 : 0),
      `${p.icon} ${p.name}`,
      connected ? COLORS.stone : COLORS.text,
      cardWidth - 2,
      connected ? COLORS.header : undefined
    )
    if (connected && cardHeight > 1)
      text(c, left + 1, top, '[Connected]', COLORS.ground, cardWidth - 2, COLORS.muted)
    c.targets.push({
      id,
      x: left,
      y: top,
      width: cardWidth,
      height: cardHeight,
      hint: connected ? `${p.name} · Connected` : `Configure ${p.name}`,
    })
  })
  scrollTrack(
    c,
    x + width - 1,
    y,
    count * cardHeight,
    win.start,
    win.count,
    Math.ceil(choices.length / columns)
  )
  const formY = y + count * cardHeight,
    fieldWidth = width - 16
  text(
    c,
    x,
    formY,
    CLOUD_CONNECTION_NOTES[current.id] ? 'OpenAI-compatible gateway required' : current.name,
    COLORS.text,
    width,
    undefined,
    true
  )
  const key = s.cloud.key ? '*'.repeat(Math.min(20, s.cloud.key.length)) : 'Enter API key'
  if (fieldHeight === 3) panel(c, x, formY + 1, fieldWidth, fieldHeight, focus === 'cloud-key')
  fieldControl(
    c,
    'cloud-key',
    x + (fieldHeight === 3 ? 1 : 0),
    formY + (fieldHeight === 3 ? 2 : 1),
    fieldWidth - (fieldHeight === 3 ? 2 : 0),
    key + (focus === 'cloud-key' ? '_' : ''),
    'Type or paste your API key',
    focus
  )
  const keyTarget = c.targets.at(-1)!
  Object.assign(keyTarget, { x, y: formY + 1, width: fieldWidth, height: fieldHeight })
  quietButton(
    c,
    'cloud-options',
    x,
    formY + fieldHeight + 1,
    `Connection options ${options ? '^' : 'v'}`,
    CLOUD_CONNECTION_NOTES[current.id] ?? 'Endpoint and optional model IDs',
    focus
  )
  if (options) {
    fieldControl(
      c,
      'cloud-provider',
      x,
      formY + fieldHeight + 2,
      width,
      `Provider: ${s.cloud.provider || 'Enter provider name'}`,
      'Provider ID',
      focus
    )
    fieldControl(
      c,
      'cloud-url',
      x,
      formY + fieldHeight + 3,
      width,
      `Base URL: ${s.cloud.url || 'Enter endpoint'}`,
      CLOUD_CONNECTION_NOTES[current.id] ?? 'OpenAI-compatible endpoint URL',
      focus
    )
    fieldControl(
      c,
      'cloud-models',
      x,
      formY + fieldHeight + 4,
      width,
      `Models: ${s.cloud.models || 'Discover automatically'}`,
      'Optional model IDs, separated by commas',
      focus
    )
  }
  if (s.cloud.checking)
    text(
      c,
      x + width - 14,
      formY + 2,
      `${['|', '/', '-', '\\'][Math.floor(seconds * 8) % 4]} Checking`,
      COLORS.gold,
      14
    )
  else if (current.saved?.connected) text(c, x + width - 13, formY + 2, '[Connected]', COLORS.muted, 13)
  else if (s.cloud.provider.trim() && (s.cloud.key.trim() || !cloudNeedsKey(current.id)))
    actionButton(
      c,
      'cloud-save',
      x + width - 13,
      formY + (fieldHeight === 3 ? 1 : 0),
      'Connect',
      'Check and save this provider',
      focus
    )
  else text(c, x + width - 12, formY + 2, 'Connect', COLORS.stone, 12)
  if (s.cloud.error) text(c, x, bottom - 1, s.cloud.error, COLORS.red, width)
}

export function setupCloudInput(input: string, key: Key, s: WorkspaceState) {
  if (s.firstRun !== 'cloud' || s.overlay || s.cloud.checking) return null
  const fields: Record<string, 'provider' | 'key' | 'url' | 'models'> = {
    'cloud-provider': 'provider',
    'cloud-key': 'key',
    'cloud-url': 'url',
    'cloud-models': 'models',
  }
  const field = fields[s.focus]
  if (!field || key.tab || key.escape) return null
  if (key.return) return { action: 'cloud-save' }
  if (key.ctrl && input !== 'u') return null
  if (key.meta || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return null
  const value = s.cloud[field]
  // eslint-disable-next-line no-control-regex
  const typed = input.replace(/[\u0000-\u001f\u007f]/g, '')
  const next =
    key.backspace || key.delete
      ? graphemes(value).slice(0, -1).join('')
      : key.ctrl && input === 'u'
        ? ''
        : value + typed
  return { patch: { cloud: { ...s.cloud, [field]: next, error: '' } } }
}
