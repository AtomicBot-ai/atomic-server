import { button, COLORS, text } from './draw/canvas.js'
import type { Canvas } from './draw/canvas.js'
import type { WorkspaceState } from './state.js'
import { serverRunning, serverSelection } from './server/server-status.js'
import { engineName } from '../../terminal-setup/index.js'

/** Short terminals retain the actual server actions without compressing agent cards. */
export function drawCompactStatus(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  focus: string
) {
  if (c.height >= 24 || s.page !== 'server' || s.serverView !== 'overview') return false
  const selected = serverSelection(s)
  const provider = s.engines.find((engine) => engine.id === selected.engine)?.provider ?? selected.engine
  const status =
    s.workspace?.eye === 'error'
      ? 'Server error'
      : s.workspace?.eye === 'starting'
        ? 'Starting…'
        : serverRunning(s)
          ? 'Running'
          : 'Stopped'
  text(c, x, y, status, status === 'Server error' ? COLORS.red : COLORS.gold, width, undefined, true)
  button(
    c,
    'server-model-page:engine',
    x,
    y + 2,
    `Engine: ${provider ? engineName(provider) : 'Choose engine'}`.slice(0, width - 2),
    'Choose an inference engine',
    focus
  )
  button(
    c,
    'server-model-page:model',
    x,
    y + 3,
    `Model: ${selected.model || 'Choose model'}`.slice(0, width - 2),
    'Choose a model',
    focus
  )
  button(c, 'guide-open', x, y + 5, 'Connect an agent', 'Configure an agent', focus)
  button(c, 'server-endpoint', x, y + 6, 'Configure an endpoint', 'Connect your application', focus)
  return true
}
