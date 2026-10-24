import { serverSelection } from './server-status.js'
import { engineName, modelProvider } from '../../../terminal-setup/index.js'
import { button, COLORS, text } from '../draw/canvas.js'
import { fieldControl, toggleControl, saveActions } from '../draw/controls.js'
import { panel } from '../draw/cards.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
export function drawServerSettings(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  const modelPage = s.serverView === 'model',
    proxyPage = s.serverView === 'proxy'
  text(
    c,
    x,
    y,
    modelPage ? 'Engine & model' : proxyPage ? 'HTTPS proxy' : 'Configuration',
    COLORS.text,
    width,
    undefined,
    true
  )
  y += 2
  const value = (path: string, fallback = '') =>
    s.configDraft[path] ?? s.base.config.rows.find((r) => r.path === path)?.value ?? fallback
  const field = (id: string, label: string, shown: string, hint = label) => {
    text(c, x, y++, label, COLORS.muted, width)
    fieldControl(c, id, x, y++, width, shown.replace(/ ▾$/, ''), hint, focus, shown.endsWith(' ▾'))
    y++
  }
  if (modelPage) {
    const selection = serverSelection(s)
    const selected = selection.engine
    const engine = s.engines.find((e) => e.id === selected || e.provider === selected)
    field(
      'server-engine',
      'Engine',
      `${selected ? engineName(engine?.provider ?? selected.split('|')[0]!) : 'Choose engine'} ▾`
    )
    field('server-model', 'Model', `${selection.model || 'Choose model'} ▾`)
    if (s.serverDraft) {
      if (!s.busy) {
        saveActions(
          c,
          x,
          bottom,
          width,
          focus,
          'server-selection-save',
          'server-selection-discard',
          'Apply the engine and model selection'
        )
      } else text(c, x, bottom - 1, 'Applying selection…', COLORS.muted, width)
    }
    return
  }
  if (proxyPage) {
    text(c, x, y++, 'Used for engine and model downloads.', COLORS.muted, width)
    y++
    field('setting:proxy.url', 'Proxy URL', value('proxy.url') || 'Not configured')
    field('setting:proxy.noProxy', 'Bypass proxy for', value('proxy.noProxy') || 'None')
    button(
      c,
      'setting:proxy.ignoreSsl',
      x,
      y++,
      `${value('proxy.ignoreSsl') === 'true' ? '[x]' : '[ ]'} Ignore certificate errors`,
      'Only enable for a trusted proxy with a self-signed certificate',
      focus
    )
  } else {
    field(
      'server-host',
      'Server host',
      `${value('api.host', '127.0.0.1') === '0.0.0.0' ? 'Local network' : 'This device'} ▾`
    )
    const half = Math.floor(width / 2)
    text(c, x, y, 'Port', COLORS.muted, half)
    text(c, x + half, y++, 'API prefix', COLORS.muted, width - half)
    fieldControl(c, 'setting:api.port', x, y, half - 1, value('api.port', '1337'), 'Server port', focus)
    fieldControl(
      c,
      'setting:api.prefix',
      x + half,
      y++,
      width - half,
      value('api.prefix', '/v1'),
      'API path prefix',
      focus
    )
    y++
    button(c, 'page:keys', x, y++, 'API key  ·  Manage keys ›', 'Create, copy or revoke API keys', focus)
    text(c, x, y, 'Start automatically', COLORS.text, width - 9)
    toggleControl(
      c,
      'setting:api.autoStart',
      x + width - 7,
      y++,
      value('api.autoStart') === 'true',
      'Start the API when the background server launches',
      focus
    )
    button(
      c,
      'server-advanced',
      x,
      y++,
      `${s.serverAdvanced ? '▾' : '▸'} Advanced`,
      'Trusted hosts and CORS',
      focus
    )
    if (s.serverAdvanced && y < bottom - 3) {
      button(
        c,
        'setting:api.trustedHosts',
        x,
        y++,
        `Trusted hosts  ${value('api.trustedHosts') || 'Default'}`.slice(0, width - 2),
        'Allowed Host header values',
        focus
      )
      button(
        c,
        'setting:api.cors',
        x,
        y,
        `${value('api.cors', 'true') === 'true' ? '[x]' : '[ ]'} Allow cross-origin requests`,
        'Send CORS headers',
        focus
      )
    }
  }
  if (Object.keys(s.configDraft).length) {
    saveActions(
      c,
      x,
      bottom,
      width,
      focus,
      'settings-save',
      'settings-discard',
      'Apply settings and restart a running API'
    )
  }
}
export function serverChoices(s: WorkspaceState) {
  if (s.serverChoice === 'host')
    return [
      { id: '127.0.0.1', label: 'This device', detail: 'Only applications on this computer' },
      { id: '0.0.0.0', label: 'Local network', detail: 'Applications on your network' },
    ]
  if (s.serverChoice === 'engine')
    return s.engines.map((e) => ({
      id: e.id,
      label: engineName(e.provider),
      detail: `${e.version} / ${e.backend} · ${e.installed ? 'Installed' : 'Install on save'}`,
    }))
  const engine = s.engines.find((e) => e.id === serverSelection(s).engine)
  return s.installed
    .filter(
      (m) =>
        !engine ||
        (m.providers ?? [m.provider]).includes(engine.provider) ||
        modelProvider(engine.id, m.provider) === engine.provider
    )
    .map((m) => ({ id: m.id, label: m.name || m.id, detail: (m.providers ?? [m.provider]).join(' · ') }))
}
export function drawServerChoice(c: Canvas, s: WorkspaceState, focus: string) {
  const width = Math.min(64, c.width - 6),
    x = Math.floor((c.width - width) / 2),
    y = 3
  const choices = serverChoices(s),
    capacity = Math.max(1, Math.floor((c.height - 11) / 3))
  const selected = Math.max(0, Number(focus.replace('server-choice:', '')) || 0)
  const offset = Math.max(0, Math.min(selected - capacity + 1, choices.length - capacity))
  const height = Math.min(c.height - 7, Math.max(8, choices.length * 3 + 5))
  panel(c, x, y, width, height)
  c.popover = { x, y, width, height }
  c.targets = []
  text(
    c,
    x + 2,
    y + 1,
    s.serverChoice === 'engine'
      ? 'Choose engine'
      : s.serverChoice === 'model'
        ? 'Choose model'
        : 'Server host',
    COLORS.text,
    width - 4,
    undefined,
    true
  )
  if (s.pickerBusy) text(c, x + 2, y + 3, 'Loading…', COLORS.muted, width - 4)
  else
    choices.slice(offset, offset + capacity).forEach((choice, i) => {
      button(
        c,
        `server-choice:${offset + i}`,
        x + 2,
        y + 3 + i * 3,
        `${(s.serverChoice === 'engine' ? serverSelection(s).engine : s.serverChoice === 'model' ? serverSelection(s).model : (s.configDraft['api.host'] ?? s.base.config.rows.find((r) => r.path === 'api.host')?.value ?? '127.0.0.1')) === choice.id ? '✓' : ' '} ${choice.label}`.slice(
          0,
          width - 6
        ),
        choice.detail,
        focus
      )
      text(c, x + 3, y + 4 + i * 3, choice.detail, COLORS.muted, width - 6)
    })
  if (!s.pickerBusy && !choices.length)
    button(c, 'library:catalog', x + 2, y + 3, 'Download a model', 'Open the model catalog', focus)
  if (s.pickerError) text(c, x + 2, y + height - 2, s.pickerError, COLORS.red, width - 4)
}
