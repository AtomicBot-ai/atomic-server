import { AGENT_DETAILS } from './agent-details.js'
import { CONNECTION_AGENTS } from '../../../contract/index.js'
import type { WorkspaceState } from '../state.js'
import type { Canvas } from '../draw/canvas.js'
import { button, COLORS, text } from '../draw/canvas.js'
import { fieldControl, scrollTrack } from '../draw/controls.js'
import { panel } from '../draw/cards.js'
import { drawAgentLabel } from './agent-brand.js'
import { cockpitNotices } from './cockpit.js'
const agentDetail = (id: string) => AGENT_DETAILS[id] ?? ''
export function serverAgents(s: WorkspaceState) {
  const query = s.serverQuery.trim().toLowerCase()
  return CONNECTION_AGENTS.filter((a) => `${a.label} ${agentDetail(a.id)}`.toLowerCase().includes(query))
}
export function drawServerOverview(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  const activityBottom = bottom
  if (s.serverActivity) bottom -= Math.min(5, Math.max(3, bottom - y - 16))
  const notices = cockpitNotices(s)
  for (const notice of notices.slice(0, Math.max(0, bottom - y - 12))) {
    if (notice.id) button(c, notice.id, x, y++, notice.text.slice(0, width - 2), notice.hint ?? '', focus)
    else text(c, x, y++, notice.text, notice.command ? COLORS.green : COLORS.text, width)
  }
  text(c, x, y, 'Agents & tools', COLORS.text, width, undefined, true)
  button(
    c,
    'guide-open',
    x + Math.max(0, width - 12),
    y,
    'Guide me',
    'Choose an agent or configure an endpoint',
    focus
  )
  y += 2
  fieldControl(
    c,
    'server-search',
    x,
    y++,
    width,
    s.serverQuery || 'Search agents',
    'Type to filter agents · Down moves to results',
    focus
  )
  y++
  const agents = serverAgents(s),
    columns = width >= 72 ? 2 : 1
  const cardWidth = Math.floor((width - columns + 1) / columns)
  const rows = Math.max(1, Math.floor((bottom - y - 3) / 5))
  const capacity = rows * columns
  const selected = Math.min(s.selected, Math.max(0, agents.length - 1))
  const offset = Math.floor(selected / capacity) * capacity
  agents.slice(offset, offset + capacity).forEach((agent, i) => {
    const cx = x + (i % columns) * (cardWidth + 1),
      cy = y + Math.floor(i / columns) * 5
    const id = `server-agent:${offset + i}`
    panel(c, cx, cy, cardWidth, 5, focus === id)
    drawAgentLabel(c, cx + 2, cy + 1, cardWidth - 4, agent.id, agent.label, COLORS.text, true)
    const detail = agentDetail(agent.id)
    text(
      c,
      cx + 2,
      cy + 2,
      detail.length > cardWidth - 4 ? detail.slice(0, cardWidth - 5).trimEnd() + '…' : detail,
      COLORS.muted,
      cardWidth - 4
    )
    button(c, id, cx + 2, cy + 3, 'Configure >', `Configure ${agent.label}`, focus, false, true)
  })
  scrollTrack(c, x + width - 1, y, rows * 5, offset, capacity, agents.length)
  if (!agents.length) text(c, x, y + 1, 'No matching agents.', COLORS.muted, width)
  if (agents.length > capacity)
    text(
      c,
      x,
      bottom - 3,
      `${offset + 1}–${Math.min(agents.length, offset + capacity)} of ${agents.length}`,
      COLORS.muted,
      width
    )
  button(
    c,
    'server-endpoint',
    x,
    bottom - 2,
    'Connect your own application ›',
    'Create an OpenAI-compatible endpoint',
    focus
  )
  button(
    c,
    'server-activity',
    x,
    bottom,
    `${s.serverActivity ? '▾' : '▸'} Server activity & logs`,
    'Inspect server requests and logs',
    focus
  )
  if (s.serverActivity) {
    const lines = [
      ...s.base.activity
        .slice(-3)
        .reverse()
        .map((event) => `${event.level.toUpperCase()}  ${event.text}`),
      ...s.requests
        .slice(0, 3)
        .map(
          (request) =>
            `${request.status}  ${request.model}  ${request.duration == null ? '' : `${Math.round(request.duration)} ms`}`
        ),
      ...s.base.logs.lines.slice(-3).reverse(),
    ]
    if (!lines.length) lines.push('Server events and requests will appear here.')
    lines
      .slice(0, activityBottom - bottom)
      .forEach((line, i) => text(c, x + 1, bottom + 1 + i, line, COLORS.muted, width - 2))
  }
}
