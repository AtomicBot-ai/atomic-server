// Lifted from atomic-chat-ui ConnectorCard and connectors/index @ 807b4d9; adapted: keyboard and mouse terminal cards.
import { MCP_CONNECTORS } from '../../../contract/index.js'
import { connectorTemplate } from '../../../workspace-view/index.js'
import { button, COLORS, text, wrap } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { panel, actionButton } from '../draw/cards.js'
import { fieldControl, scrollTrack } from '../draw/controls.js'
import type { WorkspaceState } from '../state.js'
import { featureData } from './feature-model.js'
export function drawConnectorSettings(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  const data = featureData(s)
  text(c, x, y, 'MCP connectors', COLORS.text, width, undefined, true)
  actionButton(c, 'feature-add', x, y + 2, 'Add Server', 'Add a custom MCP server', focus)
  button(c, 'feature-connector-json', x + 20, y + 3, 'Import Config', 'Edit MCP configuration', focus)
  const rows = [
    ...data.connectors.map((config) => ({ config, template: connectorTemplate(config) })),
    ...MCP_CONNECTORS.filter(
      (t) => !t.hidden && !data.connectors.some((v) => connectorTemplate(v)?.serverKey === t.serverKey)
    ).map((template) => ({ config: undefined, template })),
  ]
  const columns = width >= 90 ? 2 : 1,
    cardWidth = Math.floor((width - (columns - 1) * 2) / columns),
    height = 9,
    capacity = Math.max(1, Math.floor((bottom - y - 7) / height)),
    total = Math.ceil(rows.length / columns),
    offset = Math.min(s.scroll, Math.max(0, total - capacity))
  rows.slice(offset * columns, (offset + capacity) * columns).forEach(({ config, template }, i) => {
    const left = x + (i % columns) * (cardWidth + 2),
      top = y + 7 + Math.floor(i / columns) * height,
      name = template?.name ?? config?.name ?? '',
      id = config?.id ?? template!.serverKey,
      status = config ? data.connector_status[id] : undefined
    panel(c, left, top, cardWidth, height - 1)
    text(
      c,
      left + 2,
      top + 1,
      `[${name.slice(0, 2).toUpperCase()}] ${name}`,
      COLORS.text,
      cardWidth - 4,
      undefined,
      true
    )
    text(
      c,
      left + 2,
      top + 2,
      config
        ? !config.enabled
          ? 'Inactive'
          : status?.state === 'connected'
            ? 'Connected'
            : status?.state === 'error'
              ? 'Error'
              : status?.state === 'checking'
                ? 'Connecting…'
                : 'Inactive'
        : `By ${template?.author}`,
      status?.state === 'connected' ? COLORS.green : COLORS.muted,
      cardWidth - 4
    )
    wrap(
      status?.error ??
        template?.description ??
        (config?.type === 'stdio' ? config.command : config?.url) ??
        '',
      cardWidth - 4
    )
      .slice(0, 2)
      .forEach((line, n) => text(c, left + 2, top + 3 + n, line, COLORS.muted, cardWidth - 4))
    if (config) {
      button(
        c,
        `feature-connector-menu:${id}`,
        left + 2,
        top + 6,
        'Actions…',
        'Edit, JSON, tools and delete',
        focus
      )
      button(
        c,
        `feature-connector-toggle:${id}`,
        left + cardWidth - 16,
        top + 6,
        config.enabled ? '[x] Enabled' : '[ ] Disabled',
        'Enable connector',
        focus
      )
    } else
      button(
        c,
        `feature-connector-setup:${id}`,
        left + 2,
        top + 6,
        template?.auth ? 'Sign in' : 'Set Up',
        `Connect ${name}`,
        focus
      )
  })
  scrollTrack(c, x + width, y + 7, bottom - y - 7, offset, capacity, total)
}
export function drawConnectorOverlay(c: Canvas, s: WorkspaceState, focus: string): boolean {
  const editor = s.featureEditor
  if (s.overlay !== 'feature-editor' || !editor?.kind.startsWith('connector-')) return false
  const kind = editor.kind,
    value = editor.value,
    w = Math.min(kind === 'connector-json' ? 92 : 64, c.width - 6),
    h = Math.min(
      c.height - 6,
      kind === 'connector-json' ? 26 : kind === 'connector-menu' ? 15 : kind === 'connector-tools' ? 23 : 12
    ),
    x = Math.floor((c.width - w) / 2),
    y = Math.floor((c.height - h) / 2)
  c.targets = []
  c.popover = { x, y, width: w, height: h }
  panel(c, x, y, w, h)
  const title =
    kind === 'connector-json'
      ? 'Edit MCP configuration'
      : kind === 'connector-secret'
        ? `Connect ${value['name']}`
        : kind === 'connector-oauth' || kind === 'connector-oauth-client'
          ? `Sign in to ${value['name']}`
          : kind === 'connector-tools'
            ? `${value['name']} tools`
            : (value['name'] ?? 'Connector')
  text(c, x + 2, y + 1, title, COLORS.text, w - 4, undefined, true)
  if (kind === 'connector-json') {
    const lines = (value['content'] ?? '').split('\n'),
      capacity = h - 8,
      offset = Math.max(0, lines.length - capacity)
    for (let n = 0; n < capacity; n++)
      text(c, x + 2, y + 3 + n, lines[offset + n] ?? '', COLORS.text, w - 4, COLORS.header)
    c.targets.push({
      id: 'feature-field:content',
      x: x + 2,
      y: y + 3,
      width: w - 4,
      height: capacity,
      hint: 'Paste or edit MCP JSON',
    })
    actionButton(
      c,
      'feature-save',
      x + w - 16,
      y + h - 4,
      s.busy ? 'Saving…' : 'Save',
      'Save configuration',
      focus
    )
  } else if (kind === 'connector-secret') {
    text(c, x + 2, y + 3, value['label'] ?? 'API key', COLORS.muted, w - 4)
    fieldControl(
      c,
      'feature-field:secret',
      x + 2,
      y + 4,
      w - 4,
      '*'.repeat((value['secret'] ?? '').length),
      'API key',
      focus
    )
    if (value['help'])
      button(c, 'feature-connector-help', x + 2, y + 6, 'Get your API key', 'Open key settings', focus)
    actionButton(
      c,
      'feature-save',
      x + w - 19,
      y + h - 4,
      s.busy ? 'Connecting…' : 'Connect',
      'Connect',
      focus
    )
  } else if (kind === 'connector-oauth-client') {
    text(c, x + 2, y + 3, 'OAuth client ID (optional)', COLORS.muted, w - 4)
    fieldControl(
      c,
      'feature-field:client_id',
      x + 2,
      y + 4,
      w - 4,
      value['client_id'] ?? '',
      'OAuth client ID',
      focus
    )
    actionButton(
      c,
      'feature-save',
      x + w - 22,
      y + h - 4,
      s.busy ? 'Starting…' : 'Retry sign-in',
      'Retry sign-in',
      focus
    )
  } else if (kind === 'connector-oauth') {
    text(c, x + 2, y + 3, 'Complete sign-in in your browser.', COLORS.text, w - 4)
    text(c, x + 2, y + 5, 'Waiting for sign-in…', COLORS.muted, w - 4)
    button(c, 'feature-connector-open', x + 2, y + 7, 'Open sign-in', 'Open browser', focus)
  } else if (kind === 'connector-menu') {
    const labels = [
      ['edit', 'Edit'],
      ['json', 'Edit JSON'],
      ['tools', 'Tools'],
      ['connect', 'Reconnect'],
      ...(value['oauth'] === 'true' ? [['signin', 'Sign in']] : []),
      ['delete', 'Delete'],
    ]
    labels.forEach(([action, label], i) =>
      button(c, `feature-connector-${action}:${value['id']}`, x + 2, y + 3 + i, label!, label!, focus)
    )
  } else {
    const tools = featureData(s).connector_status[value['id'] ?? '']?.tools ?? []
    const lines = tools.length
      ? tools.flatMap((t) => [t.name, ...wrap(t.description ?? '', w - 4), ''])
      : ['Connect this server to discover its tools.']
    lines
      .slice(s.scroll, s.scroll + h - 6)
      .forEach((line, i) => text(c, x + 2, y + 3 + i, line, COLORS.text, w - 4))
    scrollTrack(c, x + w - 2, y + 3, h - 6, s.scroll, h - 6, lines.length)
  }
  button(
    c,
    'close',
    x + 2,
    y + h - 3,
    kind === 'connector-menu' || kind === 'connector-tools' ? 'Close' : 'Cancel',
    'Close',
    focus
  )
  if (s.message) text(c, x + 2, y + h - 5, s.message, COLORS.muted, w - 4)
  return true
}
