import { railLayout } from './rail.js'
import { drawSidebarControl } from './server/sidebar-control.js'
export { serverRunning } from './server/server-status.js'
import {
  LIBRARY_SECTIONS,
  SETTINGS_SECTIONS,
  SETTINGS_WORKSPACE_SECTIONS,
  PLAYGROUND_TASKS,
  SERVER_NAVIGATION,
  CONNECTION_AGENTS,
} from '../../contract/index.js'
import { workspacePage, serverSection, playgroundTask } from './navigation.js'
import { text, COLORS } from './draw/canvas.js'
import { navigationRow, scrollTrack } from './draw/controls.js'
import { fill } from './draw/fortress.js'
import { agentMark, drawAgentLabel } from './server/agent-brand.js'
import type { Canvas } from './draw/canvas.js'
import type { WorkspaceState } from './state.js'

export const SERVER_SIDEBAR = SERVER_NAVIGATION
export function drawRail(c: Canvas, s: WorkspaceState, bottom: number, focus: string) {
  const width = 13,
    { top, start, count, items } = railLayout(c, s, bottom)
  fill(c, 0, top, width + 1, bottom - top + 1, COLORS.header)
  const page = workspacePage(s)
  for (const { id, label, icon, y } of items) {
    const active = (id.startsWith('page:') && page === id.slice(5)) || focus === id
    const background = active ? COLORS.focus : COLORS.navButton
    fill(c, 0, y, width, 2, background)
    for (const edge of [0, width - 1])
      for (const row of [y, y + 1])
        text(c, edge, row, '│', active ? COLORS.gold : COLORS.navEdge, 1, COLORS.header)
    text(
      c,
      Math.floor((width - icon.length) / 2),
      y,
      icon,
      active ? COLORS.gold : COLORS.muted,
      width,
      background
    )
    text(
      c,
      Math.floor((width - label.length) / 2),
      y + 1,
      label,
      active ? COLORS.gold : COLORS.muted,
      width,
      background
    )
    c.targets.push({ id, x: 0, y, width, height: 2, hint: label })
  }
  for (let row = top; row <= bottom; row++) text(c, width, row, '│', COLORS.line, 1)
  scrollTrack(c, width, top + 1, bottom - top - 1, start, count, 6)
}
function row(
  c: Canvas,
  id: string,
  x: number,
  y: number,
  label: string,
  focus: string,
  selected = false,
  hint = label
) {
  navigationRow(c, id, x, y, 22, label, focus, selected, hint)
}
export function drawSidebar(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  bottom: number,
  focus: string,
  seconds = 0
) {
  const top = y,
    page = workspacePage(s)
  fill(c, x - 1, y, 24, bottom - y + 1, COLORS.surface)
  text(
    c,
    x + 1,
    y++,
    page === 'server'
      ? 'Server'
      : page === 'models'
        ? 'Models Hub'
        : page === 'chat'
          ? 'Playground'
          : 'Settings',
    COLORS.text,
    20,
    undefined,
    true
  )
  y++
  if (page === 'server') {
    y = drawSidebarControl(c, s, x, y, focus, seconds)
    for (const item of SERVER_SIDEBAR)
      row(c, `server-section:${item.id}`, x, y++, item.label, focus, serverSection(s) === item.id)
    if (bottom - y >= 2) y++
    text(c, x + 1, y++, 'Agents & tools', COLORS.muted, 20)
    const count = Math.max(0, bottom - y + 1)
    const offset = Math.min(s.sidebarOffset, Math.max(0, CONNECTION_AGENTS.length - count))
    CONNECTION_AGENTS.slice(offset, offset + count).forEach((a, i) => {
      row(
        c,
        `sidebar-agent:${offset + i}`,
        x,
        y + i,
        `${agentMark(a.id)} ${a.label}`,
        focus,
        false,
        `Configure ${a.label} · Scroll for more agents`
      )
      drawAgentLabel(
        c,
        x + 2,
        y + i,
        19,
        a.id,
        a.label,
        focus === `sidebar-agent:${offset + i}` ? COLORS.text : COLORS.muted
      )
    })
    if (offset + count < CONNECTION_AGENTS.length) text(c, x + 21, bottom, '↓', COLORS.gold, 1)
  } else {
    const items =
      page === 'models'
        ? [...LIBRARY_SECTIONS].sort((a, b) => Number(b.id === 'downloads') - Number(a.id === 'downloads'))
        : page === 'chat'
          ? PLAYGROUND_TASKS
          : [...SETTINGS_SECTIONS, ...SETTINGS_WORKSPACE_SECTIONS]
    const prefix = page === 'models' ? 'library' : page === 'chat' ? 'playground-task' : 'settings-section'
    const selected = page === 'models' ? s.libraryView : page === 'chat' ? playgroundTask(s) : s.settingsGroup
    for (const item of items) {
      if (page === 'access' && item.id === 'assistants') {
        y++
        text(c, x + 1, y++, 'Workspace', COLORS.muted, 20)
      }
      if (page === 'models' && item.id === 'catalog') {
        y++
        text(c, x + 1, y++, 'Discover', COLORS.muted, 20)
      }
      if (y > bottom) break
      row(c, `${prefix}:${item.id}`, x, y++, item.label, focus, selected === item.id)
    }
    if (page === 'chat' && y + 3 < bottom) {
      y++
      row(c, 'new', x, y++, '+ New chat', focus)
      text(c, x + 1, y++, 'Recents', COLORS.muted, 20)
      for (const h of s.history.slice(0, bottom - y + 1))
        row(c, `history:${h.id}`, x, y++, h.title, focus, h.id === s.conversation?.id)
    }
  }
  for (let r = top; r <= bottom; r++) text(c, x + 22, r, '│', COLORS.line, 1)
}
