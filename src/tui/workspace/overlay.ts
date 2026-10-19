import { drawInstallReview } from './library/library-panel.js'
import { drawGoalSetup } from './setup/goal-setup.js'
import { drawOperationOverlay } from './operations/operation-panel.js'
import { AGENTS } from '../../agent-launch/index.js'
import { button, COLORS, text, wrap } from './draw/canvas.js'
import type { Canvas } from './draw/canvas.js'
import type { WorkspaceState } from './state.js'
import { PAGES } from './state.js'
import { helpLines } from '../command-list.js'
import { example } from './actions.js'
import { tooltip } from './draw/tooltip.js'
const ms = (v: number | null) => (v === null ? 'Not available' : `${Math.round(v)} ms`)
export function drawOverlay(c: Canvas, s: WorkspaceState, focus: string): void {
  if (s.overlay === 'setup-goal') {
    drawGoalSetup(c, focus)
    return
  }
  for (const row of c.cells)
    for (const cell of row) {
      cell.background = COLORS.ground
      cell.color = COLORS.stone
    }
  if (s.overlay === 'install-review') {
    drawInstallReview(c, s, focus)
    return
  }
  if (drawOperationOverlay(c, s, focus)) return
  const x = 3,
    y = 3,
    w = c.width - 6,
    h = c.height - 6
  for (let r = y; r < y + h; r++) text(c, x, r, ' '.repeat(w), COLORS.text, w, COLORS.header)
  c.targets = []
  const put = (row: number, v: string, color: string = COLORS.text) =>
    text(c, x + 2, y + row, v, color, w - 4, COLORS.header)
  const b = (id: string, row: number, label: string, hint: string) =>
    button(c, id, x + 2, y + row, label, hint, focus)
  if (s.overlay === 'images') {
    put(2, 'Attached images', COLORS.gold)
    s.images.forEach((image, i) =>
      b(`image-remove:${i}`, 4 + i, `${image.name}  ×`, 'Remove image from this message')
    )
    b('image-add', h - 3, '+ Image', 'Attach another image | Up to four, 8 MB each')
    button(c, 'close', x + 16, y + h - 3, 'Done', 'Return to composer', focus)
    return
  } else if (s.overlay === 'workspace') {
    put(2, 'Starting workspace', COLORS.gold)
    put(4, 'Choose where Atomic Chat opens next time.', COLORS.muted)
    b('personal', 6, 'Personal terminal', 'Open directly into chat.')
    b('hosting', 8, 'Server console', 'Open directly into API controls.')
  } else if (s.overlay === 'credential') {
    put(2, 'Your API key', COLORS.gold)
    wrap(s.secret || 'Key hidden.', w - 4).forEach((line, i) => put(5 + i, line))
    put(9, 'Shown for one minute. You can reveal it again from API keys.', COLORS.muted)
    b('copy-secret', h - 3, 'Copy key', 'Copy this credential to your terminal clipboard.')
    button(c, 'close', x + 16, y + h - 3, 'Done', 'Hide this key.', focus)
    return
  } else if (s.overlay === 'revoke-key' || s.overlay === 'delete-chat') {
    const key = s.overlay === 'revoke-key'
    put(2, key ? 'Revoke this API key?' : 'Delete this conversation?', COLORS.gold)
    wrap(
      key
        ? 'Apps using this key will lose access on their next request. Other keys continue to work.'
        : 'This removes the saved conversation from this device. It cannot be undone.',
      w - 4
    ).forEach((line, i) => put(4 + i, line))
    b(
      key ? 'revoke-key-confirm' : 'delete-chat-confirm',
      h - 3,
      key ? 'Revoke key' : 'Delete conversation',
      'Confirm this action.'
    )
    button(c, 'close', x + 25, y + h - 3, 'Keep it', 'Cancel without making changes.', focus)
    return
  } else if (s.overlay === 'menu' && !s.setupComplete) {
    put(2, 'Prepare your workspace first', COLORS.gold)
    put(4, 'Choose an engine and models, then let installation finish.', COLORS.muted)
    tooltip(c, x + 2, y + 6, 'Ctrl+Q Close | Downloads continue in background', w - 4, COLORS.header)
  } else if (s.overlay === 'menu') {
    put(2, 'Go to', COLORS.gold)
    PAGES.forEach((p, i) => b(`page:${p.id}`, 4 + i, `${p.name}  [${p.key}]`, p.hint))
    b('page:history', 9, 'History  [Ctrl+P]', 'Search and resume saved conversations.')
    b('new', 10, 'New chat  [Ctrl+N]', 'Start another conversation.')
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
    put(2, 'Keyboard shortcuts', COLORS.gold)
    ;[
      'Tab / Shift+Tab | Next / previous control',
      'Enter | Open or activate',
      'Esc | Close dialog or open menu',
      'Alt+1/2/3 | Playground / Server / Engines & Models',
      'Ctrl+K Help | F4 Server console',
      'Ctrl+N / Ctrl+P | New chat / history',
      'Ctrl+X | Mouse / text selection',
      'Ctrl+C | Stop a response',
      'Ctrl+Q | Close terminal; server stays running',
      'Shift+Enter / Alt+Enter | New line in composer',
      'PageUp / PageDown | Scroll current view',
    ]
      .slice(0, h - 6)
      .forEach((r, i) => tooltip(c, x + 2, y + i + 4, r, w - 4, COLORS.header))
  } else if (s.overlay === 'endpoint') {
    const titles: Record<string, string> = {
      'setup-query': 'Find a model',
      'library-query': 'Search model catalog',
      'image-path': 'Attach image',
      'history-search': 'Search your conversations',
      'key-name': 'Name this API key',
      'rename-chat': 'Rename conversation',
    }
    put(
      2,
      titles[s.edit] ??
        (s.edit.startsWith('operation-')
          ? s.edit === 'operation-json'
            ? 'Request JSON'
            : s.edit.slice(16).replace(/^request\./, '')
          : s.edit.startsWith('setting:')
            ? 'Edit setting'
            : 'Connect a model endpoint'),
      COLORS.gold
    )
    put(
      4,
      s.edit.startsWith('operation-')
        ? 'Enter a value. Leave empty to use the server default.'
        : titles[s.edit]
          ? s.edit === 'key-name'
            ? 'For example: Atomic Agent, work laptop, or test app'
            : 'Type a name or search term'
          : s.edit.startsWith('setting:')
            ? s.edit.slice(8)
            : 'OpenAI-compatible base URL, including /v1',
      COLORS.muted
    )
    put(6, (s.editValue + '_').slice(-(w - 4)), COLORS.text)
    tooltip(c, x + 2, y + 8, 'Enter Confirm | Esc Cancel | Ctrl+U Clear', w - 4, COLORS.header)
    b('save-edit', h - 3, 'Save', 'Validate and save this setting.')
    button(c, 'close', x + 12, y + h - 3, 'Cancel', 'Discard this edit.', focus)
    return
  } else if (s.overlay === 'stop') {
    put(2, s.edit === 'api-restart' ? 'Restart API?' : 'Stop accepting API requests?', COLORS.gold)
    wrap(
      'Active requests may be interrupted. The background server and loaded models will remain available.',
      w - 4
    ).forEach((r, i) => put(4 + i, r))
    b(
      'stop-confirm',
      h - 3,
      s.edit === 'api-restart' ? 'Restart API' : 'Stop API',
      'Active requests will be interrupted'
    )
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
