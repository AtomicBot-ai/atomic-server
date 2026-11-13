import {
  ACCOUNT_SECTIONS,
  LIBRARY_SECTIONS,
  SERVER_NAVIGATION,
  SETTINGS_SECTIONS,
  PLAYGROUND_TASKS,
  SETTINGS_WORKSPACE_SECTIONS,
} from '../../../contract/index.js'
import type { Canvas } from '../draw/canvas.js'
import { button, textWidth } from '../draw/canvas.js'
import type { Page, WorkspaceState } from '../state.js'

const SERVER_MENU = [
  ...SERVER_NAVIGATION,
  { id: 'model', label: 'Engine & model' },
  { id: 'connect', label: 'Connections' },
  { id: 'keys', label: 'API keys' },
  { id: 'traffic', label: 'Requests' },
]

/** Settings' sections in sidebar order. */
export const SETTINGS_MENU = [...SETTINGS_SECTIONS, ...SETTINGS_WORKSPACE_SECTIONS]

export function workspacePage(s: WorkspaceState): 'chat' | 'server' | 'models' | 'access' | 'account' {
  const page = s.page === 'tools' ? s.operationReturn : s.page
  if (page === 'account') return 'account'
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
  if (s.page !== 'tools' || s.operationReturn !== 'chat') return 'chat'
  if (s.operation.startsWith('audio.')) return 'audio'
  return s.operation.startsWith('media.') ? (s.operation.split('.')[1] ?? 'chat') : 'chat'
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
  const page = workspacePage(s),
    { items, prefix } = sectionMenu(s)
  const selected =
    page === 'chat'
      ? playgroundTask(s)
      : page === 'account'
        ? s.accountView
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

/** The sections of the current page: the compact Sections dialog, and the buttons of `drawSections`. */
export function sectionMenu(s: WorkspaceState): {
  title: string
  items: readonly { id: string; label: string }[]
  prefix: string
} {
  const page = workspacePage(s)
  if (page === 'account') return { title: 'Account', items: ACCOUNT_SECTIONS, prefix: 'account-section' }
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
        ? SERVER_MENU
        : page === 'models'
          ? LIBRARY_SECTIONS
          : page === 'access'
            ? SETTINGS_MENU
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
