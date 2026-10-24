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
  const running = serverRunning(s),
    selected = serverSelection(s)
  const changing = s.busy && /(?:Starting|Stopping|Restarting) (?:the )?(?:API|server)/i.test(s.message)
  const provider = s.engines.find((e) => e.id === selected.engine)?.provider ?? selected.engine.split('|')[0]
  const compact = c.height < 30
  panel(c, x, y, 22, compact ? 7 : 11, running, seconds)
  const background =
    focus === 'api-toggle' ? COLORS.composer : changing || running ? COLORS.engineButton : COLORS.gold
  const color = focus === 'api-toggle' || (!changing && !running) ? COLORS.ground : COLORS.text
  fill(c, x + 1, y + 1, 20, compact ? 2 : 3, background)
  const phase = s.motion ? Math.floor(seconds * 5) % 4 : 0
  const icon = changing ? ['|', '/', '-', '\\'][phase] : running ? '[#]' : '[>]'
  const state = changing
    ? /Stopping/i.test(s.message)
      ? 'Stopping…'
      : 'Starting…'
    : running
      ? 'Stop server'
      : 'Start server'
  const label = `${icon} ${state}`
  text(c, x + 1 + Math.floor((20 - label.length) / 2), y + 2, label, color, 20, background, true)
  if (!changing)
    c.targets.push({ id: 'api-toggle', x: x + 1, y: y + 1, width: 20, height: compact ? 2 : 3, hint: state })
  if (running && s.motion) {
    const position = Math.floor(seconds * 4) % 20
    text(
      c,
      x + 1 + position,
      y + (compact || phase < 2 ? 1 : 3),
      '─',
      focus === 'api-toggle' ? COLORS.ground : COLORS.composer,
      1,
      background
    )
  }
  if (compact) {
    for (const [id, title, value, dy] of [
      ['server-model-page:engine', 'Engine', provider ? engineName(provider) : 'Not selected', 3],
      ['server-model-page:model', 'Model', selected.model || 'Not selected', 4],
      ['server-section:connect', 'Connections', '›', 5],
    ] as const) {
      const bg = focus === id ? COLORS.header : running ? COLORS.focus : COLORS.surface
      fill(c, x + 1, y + dy, 20, 1, bg)
      text(c, x + 2, y + dy, `${title} ${value}`, COLORS.text, 18, bg)
      c.targets.push({ id, x: x + 1, y: y + dy, width: 20, height: 1, hint: title })
    }
    return y + 8
  }
  const detail = (id: string, dy: number, title: string, value: string) => {
    const bg = focus === id ? COLORS.header : running ? COLORS.focus : COLORS.surface
    fill(c, x + 1, y + dy, 20, 2, bg)
    text(c, x + 2, y + dy, title, COLORS.muted, 18, bg)
    text(c, x + 2, y + dy + 1, value + ' ›', COLORS.text, 18, bg)
    c.targets.push({ id, x: x + 1, y: y + dy, width: 20, height: 2, hint: title })
  }
  detail('server-model-page:engine', 4, 'Engine', provider ? engineName(provider) : 'Not selected')
  detail('server-model-page:model', 6, 'Model', selected.model || 'Not selected')
  const bg = focus === 'server-section:connect' ? COLORS.header : running ? COLORS.focus : COLORS.surface
  fill(c, x + 1, y + 8, 20, 2, bg)
  text(c, x + 2, y + 8, 'Connections       ›', COLORS.text, 18, bg)
  c.targets.push({
    id: 'server-section:connect',
    x: x + 1,
    y: y + 8,
    width: 20,
    height: 2,
    hint: 'Connections',
  })
  return y + 12
}
