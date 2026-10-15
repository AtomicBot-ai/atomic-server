import { LIBRARY_SECTIONS, PLAYGROUND_TASKS, SERVER_SECTIONS } from '../../contract/index.js'
import type { Canvas } from './draw/canvas.js'
import { button, textWidth } from './draw/canvas.js'
import type { Page, WorkspaceState } from './state.js'

export function workspacePage(s: WorkspaceState): 'chat' | 'server' | 'models' {
  const page = s.page === 'tools' ? s.operationReturn : s.page
  return page === 'models' ? 'models' : page === 'chat' || page === 'history' ? 'chat' : 'server'
}
export function serverSection(s: WorkspaceState): string {
  const page = s.page === 'tools' ? s.operationReturn : s.page
  if (page === 'requests') return 'traffic'
  if (page === 'access' || page === 'settings') return 'runtime'
  if (page === 'logs' || page === 'checks') return 'diagnostics'
  return 'connect'
}
export function playgroundTask(s: WorkspaceState): string {
  return s.page === 'tools' && s.operationReturn === 'chat' && s.operation.startsWith('media.')
    ? (s.operation.split('.')[1] ?? 'chat')
    : 'chat'
}
export const SERVER_PAGES: Record<string, Page> = {
  connect: 'server',
  traffic: 'requests',
  runtime: 'access',
  diagnostics: 'logs',
}
/** Section navigation stays visible while an action or detail view is open. */
export function drawSections(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  focus: string
) {
  const page = workspacePage(s)
  const items = page === 'chat' ? PLAYGROUND_TASKS : page === 'server' ? SERVER_SECTIONS : LIBRARY_SECTIONS
  const prefix = page === 'chat' ? 'playground-task' : page === 'server' ? 'server-section' : 'library'
  const selected = page === 'chat' ? playgroundTask(s) : page === 'server' ? serverSection(s) : s.libraryView
  let bx = x,
    row = y
  for (const item of items) {
    if (bx > x && bx + textWidth(item.label) + 2 > x + width) {
      bx = x
      row++
    }
    bx +=
      button(
        c,
        `${prefix}:${item.id}`,
        bx,
        row,
        item.label,
        `Open ${item.label}`,
        focus,
        selected === item.id
      ) + 1
  }
  if (page === 'server' && serverSection(s) === 'diagnostics') {
    row += 2
    bx = x
    for (const [id, label] of [
      ['page:logs', 'Logs'],
      ['open-operation:hardware.info', 'Hardware'],
      ['page:checks', 'Checks'],
    ]) {
      bx += button(c, id!, bx, row, label!, `Open ${label}`, focus) + 1
    }
  }
  return row + 2
}
