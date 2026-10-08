import { AGENTS } from '../../agent-launch/index.js'
import { button, COLORS, rule, text, wrap } from './canvas.js'
import type { Canvas } from './canvas.js'
import type { WorkspaceState } from './state.js'
import { PAGES } from './state.js'
import { helpLines } from '../command-list.js'
import { example } from './actions.js'
const ms = (v: number | null) => (v === null ? 'Not available' : `${Math.round(v)} ms`)
export function drawOverlay(c: Canvas, s: WorkspaceState, focus: string): void {
  const x = 3,
    y = 3,
    w = c.width - 6,
    h = c.height - 6
  for (let r = y; r < y + h; r++) text(c, x, r, ' '.repeat(w), COLORS.text, w, COLORS.ground)
  c.targets = []
  rule(c, x, y, w)
  rule(c, x, y + h - 1, w)
  const put = (row: number, v: string, color: string = COLORS.text) =>
    text(c, x + 2, y + row, v, color, w - 4)
  const b = (id: string, row: number, label: string, hint: string) =>
    button(c, id, x + 2, y + row, label, hint, focus)
  if (s.overlay === 'menu') {
    put(2, 'Go to', COLORS.gold)
    PAGES.forEach((p, i) => b(`page:${p.id}`, 4 + i, `${p.name}  [${p.key}]`, p.hint))
    b('new', 9, 'New chat  [Ctrl+N]', 'Start another conversation.')
  } else if (s.overlay === 'agent') {
    put(2, `Use with ${AGENTS.find((a) => a.id === s.agent)?.name}`, COLORS.gold)
    put(4, 'Atomic Chat will provide the model for this session.', COLORS.muted)
    b('agent-model', 6, `Model: ${s.agentModel}`, 'Choose the next available model.')
    put(8, 'Launch switches this terminal to the agent. Exit it to return.', COLORS.muted)
    put(
      10,
      s.agent === 'atomic-agent'
        ? 'Uses a separate Atomic Chat profile for Atomic Agent.'
        : 'Your existing provider settings are preserved.',
      COLORS.muted
    )
    b('launch-agent', h - 3, 'Launch and switch', 'Open the agent with Atomic Chat as its model provider.')
    button(c, 'close', x + 25, y + h - 3, 'Cancel', 'Return to Server.', focus)
    return
  } else if (s.overlay === 'command') {
    const row = s.commands[s.selected]
    if (row) {
      put(2, `atc ${row.path.join(' ')}  /  ${row.status}`, COLORS.gold)
      helpLines(row, w - 4)
        .slice(s.scroll, s.scroll + h - 7)
        .forEach((line, i) => put(4 + i, line))
    }
  } else if (s.overlay === 'help') {
    put(2, 'A few keys, anywhere', COLORS.gold)
    ;[
      'Tab / Shift+Tab   Focus next / previous control',
      'Enter             Open or activate',
      'Esc               Close this layer or open the menu',
      'Ctrl+G, C/S/M/,   Chat / Server / Models / Settings',
      'Ctrl+K            Keyboard shortcuts',
      'Ctrl+N            New chat',
      'Ctrl+X            Mouse / text selection',
      'Ctrl+C            Stop a response',
      'Ctrl+Q            Leave the console; server stays running',
      'Alt+Enter         New line in the composer',
      'PageUp / PageDown  Scroll the current view',
    ]
      .slice(0, h - 6)
      .forEach((r, i) => put(i + 4, r))
  } else if (s.overlay === 'endpoint') {
    put(2, s.edit.startsWith('setting:') ? 'Edit setting' : 'Connect a model endpoint', COLORS.gold)
    put(
      4,
      s.edit.startsWith('setting:') ? s.edit.slice(8) : 'OpenAI-compatible base URL, including /v1',
      COLORS.muted
    )
    put(6, (s.editValue + '_').slice(-(w - 4)), COLORS.text)
    put(8, 'Enter saves. Esc cancels. Credentials belong in ATC_CHAT_API_KEY.', COLORS.muted)
    b('save-edit', h - 3, 'Save', 'Validate and save this setting.')
    button(c, 'close', x + 12, y + h - 3, 'Cancel', 'Discard this edit.', focus)
    return
  } else if (s.overlay === 'stop') {
    put(2, 'Stop accepting API requests?', COLORS.gold)
    wrap(
      'Active requests may be interrupted. The background server and loaded models will remain available.',
      w - 4
    ).forEach((r, i) => put(4 + i, r))
    b('stop-confirm', h - 3, 'Stop API', 'Stop the public listener now.')
    button(c, 'close', x + 17, y + h - 3, 'Keep running', 'Close without changing the server.', focus)
    return
  } else if (s.overlay === 'detail') {
    const r = s.requests[s.selected]
    put(2, 'Request details', COLORS.gold)
    if (r)
      [
        `Model       ${r.model}`,
        `Endpoint    ${r.endpoint}`,
        `Status      ${r.status}`,
        `Duration    ${ms(r.duration)}`,
        `First token ${ms(r.firstToken)}`,
        `Tokens      ${r.tokens ?? 'Not available'}`,
        `ID          ${r.id}`,
      ]
        .slice(0, h - 6)
        .forEach((v, i) => put(4 + i, v))
  } else {
    put(2, 'Connect your application', COLORS.gold)
    wrap(example(s), w - 4)
      .slice(0, h - 8)
      .forEach((r, i) => put(4 + i, r))
    put(h - 5, 'Replace MODEL_ID and supply your key locally.', COLORS.muted)
    b('copy-example', h - 3, 'Copy example', 'Copy the example without including credentials.')
    button(c, 'close', x + 20, y + h - 3, 'Close', 'Return to the previous screen.', focus)
    return
  }
  b('close', h - 3, 'Close  [Esc]', 'Return to the previous screen.')
}
