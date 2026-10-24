import {
  LIBRARY_SECTIONS,
  PLAYGROUND_TASKS,
  SERVER_NAVIGATION,
  SETTINGS_SECTIONS,
  SETTINGS_WORKSPACE_SECTIONS,
} from '../../contract/index.js'
import type { Canvas } from './draw/canvas.js'
import { button, textWidth } from './draw/canvas.js'
import type { Page, WorkspaceState } from './state.js'

export function workspacePage(s: WorkspaceState): 'chat' | 'server' | 'models' | 'access' {
  const page = s.page === 'tools' ? s.operationReturn : s.page
  if (['configuration', 'remote', 'model', 'proxy'].includes(s.serverView)) return 'server'
  if (['access', 'settings', 'logs', 'checks', 'commands'].includes(page)) return 'access'
  return page === 'models' ? 'models' : page === 'chat' || page === 'history' ? 'chat' : 'server'
}
export function serverSection(s: WorkspaceState): string {
  const page = s.page === 'tools' ? s.operationReturn : s.page
  if (page === 'requests') return 'traffic'
  if (page === 'keys') return 'keys'
  return s.serverView
}
export function playgroundTask(s: WorkspaceState): string {
  return s.page === 'tools' && s.operationReturn === 'chat' && s.operation.startsWith('media.')
    ? (s.operation.split('.')[1] ?? 'chat')
    : 'chat'
}
export const SERVER_PAGES: Record<string, Page> = {
  overview: 'server',
  connect: 'server',
  keys: 'keys',
  traffic: 'requests',
  configuration: 'server',
  proxy: 'server',
  remote: 'server',
  model: 'server',
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
  const items =
    page === 'chat'
      ? PLAYGROUND_TASKS
      : page === 'server'
        ? SERVER_NAVIGATION
        : page === 'access'
          ? [...SETTINGS_SECTIONS, ...SETTINGS_WORKSPACE_SECTIONS]
          : LIBRARY_SECTIONS
  const prefix =
    page === 'chat'
      ? 'playground-task'
      : page === 'server'
        ? 'server-section'
        : page === 'access'
          ? 'settings-section'
          : 'library'
  const selected =
    page === 'chat'
      ? playgroundTask(s)
      : page === 'server'
        ? serverSection(s)
        : page === 'access'
          ? ['logs', 'checks'].includes(s.page === 'tools' ? s.operationReturn : s.page)
            ? 'diagnostics'
            : s.settingsGroup
          : s.libraryView
  if (width < 76) {
    button(
      c,
      'section-menu',
      x,
      y,
      `${items.find((i) => i.id === selected)?.label ?? 'Server'} ▾`,
      'Choose a section',
      focus
    )
    return y + 2
  }
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
  return row + 2
}

export function sectionMenu(s: WorkspaceState) {
  const page = workspacePage(s)
  return {
    title:
      page === 'server'
        ? 'Server'
        : page === 'models'
          ? 'Models'
          : page === 'access'
            ? 'Settings'
            : 'Playground',
    items:
      page === 'server'
        ? SERVER_NAVIGATION
        : page === 'models'
          ? LIBRARY_SECTIONS
          : page === 'access'
            ? [...SETTINGS_SECTIONS, ...SETTINGS_WORKSPACE_SECTIONS]
            : PLAYGROUND_TASKS,
    prefix:
      page === 'server'
        ? 'server-section'
        : page === 'models'
          ? 'library'
          : page === 'access'
            ? 'settings-section'
            : 'playground-task',
  }
}
