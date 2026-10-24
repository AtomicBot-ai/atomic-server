import { button, canvas, COLORS, text, wrap } from '../draw/canvas.js'
import { panel, actionButton } from '../draw/cards.js'
import { fieldControl } from '../draw/controls.js'
import { drawViewport } from '../draw/viewport.js'
import { serverRunning, serverChatModel } from './server-status.js'
import { serverEndpoint, example } from '../connection.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'

export function drawServerConnections(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  text(c, x, y, 'Connections', COLORS.text, width, undefined, true)
  const running = serverRunning(s),
    model = serverChatModel(s)
  if (!model) {
    panel(c, x, y + 2, width, 10)
    text(c, x + 2, y + 3, 'Connect your first tool', COLORS.text, width - 4, undefined, true)
    wrap('Choose an agent or configure an endpoint to connect an application.', width - 4)
      .slice(0, 2)
      .forEach((line, i) => text(c, x + 2, y + 5 + i, line, COLORS.muted, width - 4))
    actionButton(c, 'guide-open', x + 2, y + 8, 'Get started', 'Configure an agent or endpoint', focus)
    return
  }
  const content = canvas(width, 33)
  panel(content, 0, 0, width - 1, 9)
  text(
    content,
    2,
    1,
    `Connection details   ${running ? '● Running' : '○ Stopped'}`,
    COLORS.text,
    width - 5,
    undefined,
    true
  )
  text(content, 2, 2, serverEndpoint(s), COLORS.text, width - 5)
  button(content, 'copy-endpoint', 1, 3, 'Copy URL', 'Copy the server endpoint', focus)
  text(content, 2, 5, `Model  ${model}`, COLORS.muted, width - 5)
  text(
    content,
    2,
    6,
    `Access  ${s.workspace?.api.host === '0.0.0.0' ? 'Local network' : 'This device'}`,
    COLORS.muted,
    width - 5
  )
  text(
    content,
    2,
    7,
    `Authentication  ${s.workspace?.keys?.length ? 'API key required' : 'No API key configured'}`,
    COLORS.muted,
    width - 5
  )
  panel(content, 0, 10, width - 1, 7)
  text(content, 2, 11, 'Connected tools', COLORS.text, width - 5, undefined, true)
  text(content, 2, 13, 'This server does not report tool connection status.', COLORS.muted, width - 5)
  button(content, 'guide-open', 1, 15, 'Add connection', 'Configure an agent or endpoint', focus)
  panel(content, 0, 18, width - 1, 15)
  text(content, 2, 19, 'Try a request', COLORS.text, width - 5, undefined, true)
  fieldControl(
    content,
    'server-example-language',
    2,
    21,
    Math.min(24, width - 5),
    s.connectionLanguage,
    'Example language',
    focus,
    true
  )
  wrap(example(s), width - 5)
    .slice(0, 5)
    .forEach((line, i) => text(content, 2, 23 + i, line, COLORS.muted, width - 5))
  button(content, 'copy-example', 1, 29, 'Copy example', 'Copy a request without credentials', focus)
  if (running && !s.busy)
    button(content, 'server-test', 17, 29, 'Send test request', 'Test the loaded chat model', focus)
  else
    text(
      content,
      2,
      31,
      s.busy ? 'Testing…' : 'Start the server to send a test request.',
      COLORS.muted,
      width - 5
    )
  drawViewport(c, content, x, y + 2, width, bottom - y - 1, s.scroll, focus)
}
