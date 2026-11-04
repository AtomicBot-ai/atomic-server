import { setupPreparing } from '../setup/download-pending.js'
import { apiDownloadWait } from '../../../workspace-view/index.js'
/** Desktop's single server control surface, with terminal-sized status animation. */
import { serverRunning, serverSelection } from './server-status.js'
import { engineName } from '../../../terminal-setup/index.js'
import { COLORS, text } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { panel } from '../draw/cards.js'
import { fill } from '../draw/fortress.js'
import type { WorkspaceState } from '../state.js'

export function drawSidebarControl(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  focus: string,
  seconds = 0
) {
  const waiting = apiDownloadWait(s.workspace, setupPreparing(s))
  const running = !waiting && serverRunning(s),
    selected = serverSelection(s)
  const changing = Boolean(s.apiPending)
  const provider = s.engines.find((e) => e.id === selected.engine)?.provider ?? selected.engine.split('|')[0]
  panel(c, x, y, 22, 7, running, seconds)
  const background = focus === 'api-toggle' ? COLORS.accent : COLORS.surface
  const color = focus === 'api-toggle' ? COLORS.ground : COLORS.text
  const phase = s.motion ? Math.floor(seconds * 5) % 4 : 0
  const icon = changing ? ['|', '/', '-', '\\'][phase] : focus === 'api-toggle' ? '>' : ' '
  const state = changing
    ? s.apiPending === 'stopping'
      ? 'Stopping…'
      : 'Starting…'
    : running
      ? 'Stop API'
      : 'Start API'
  fill(c, x + 1, y + 1, 20, 1, background)
  text(
    c,
    x + 1,
    y + 1,
    `${icon} ${waiting?.label.replace(/^(?:Model|Engine) (?:is |download )/, '') ?? state}`,
    color,
    20,
    background,
    true
  )
  if (!changing)
    c.targets.push({
      id: 'api-toggle',
      x: x + 1,
      y: y + 1,
      width: 20,
      height: 1,
      hint: waiting?.message ?? state,
    })
  for (const [id, title, value, dy] of [
    ['server-model-page:engine', 'Engine', provider ? engineName(provider) : 'Not selected', 3],
    ['server-model-page:model', 'Model', selected.model || 'Not selected', 4],
    ['server-section:connect', 'Connections', '›', 5],
  ] as const) {
    const bg = focus === id ? COLORS.focus : COLORS.surface
    fill(c, x + 1, y + dy, 20, 1, bg)
    text(c, x + 1, y + dy, `${focus === id ? '>' : ' '} ${title} ${value}`, COLORS.text, 20, bg)
    c.targets.push({ id, x: x + 1, y: y + dy, width: 20, height: 1, hint: `${title}: ${value}` })
  }
  return y + 8
}
