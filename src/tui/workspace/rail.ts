import type { Key } from 'ink'
import type { Canvas } from './draw/canvas.js'
import type { InputResult } from './input-types.js'
import type { WorkspaceState } from './state.js'
import { workspaceHeaderRows } from './draw/brand-header.js'
import { mouseReport } from './mouse-report.js'
import { workspacePage } from './navigation.js'

export const RAIL_ITEMS = [
  { id: 'page:server', label: 'Server', icon: '[=]' },
  { id: 'page:chat', label: 'Playground', icon: '>_' },
  { id: 'page:models', label: 'Models', icon: '[#]' },
  { id: 'help', label: 'Help', icon: '(?)' },
  { id: 'open-admin', label: 'Web', icon: '[@]' },
  { id: 'page:access', label: 'Settings', icon: '(*)' },
] as const

function focusedRailIndex(s: WorkspaceState) {
  const focused = RAIL_ITEMS.findIndex((item) => item.id === s.focus)
  return focused < 0 ? RAIL_ITEMS.findIndex((item) => item.id === `page:${workspacePage(s)}`) : focused
}

/** Keep two-line controls and blank margins; short rails reveal the focused item. */
export function railLayout(c: Canvas, s: WorkspaceState, bottom: number) {
  const top = workspaceHeaderRows(c)
  const count = Math.max(1, Math.min(RAIL_ITEMS.length, Math.floor((bottom - top) / 3)))
  const start = Math.max(0, Math.min(RAIL_ITEMS.length - count, focusedRailIndex(s) - count + 1))
  const items = RAIL_ITEMS.slice(start, start + count).map((item, index) => ({
    ...item,
    y: count === RAIL_ITEMS.length && index >= 3 ? bottom - 8 + (index - 3) * 3 : top + 1 + index * 3,
  }))
  return { top, start, count, items }
}

/** Scrolling moves focus only; Enter or a click activates the selected destination. */
export function railInput(input: string, key: Key, s: WorkspaceState, frame: Canvas): InputResult | null {
  if (s.overlay || s.page === 'welcome' || s.page === 'setup') return null
  const mouse = mouseReport(input)
  const wheel = Boolean(
    mouse &&
    s.mouse &&
    mouse.code & 64 &&
    mouse.x < 14 &&
    mouse.y >= workspaceHeaderRows(frame) &&
    mouse.y <= frame.height - 4
  )
  const focused = RAIL_ITEMS.some((item) => item.id === s.focus)
  if (!wheel && !(focused && (key.upArrow || key.downArrow || key.pageUp || key.pageDown))) return null
  const delta = wheel ? (mouse!.code & 1 ? 1 : -1) : key.upArrow || key.pageUp ? -1 : 1
  const next = Math.max(0, Math.min(RAIL_ITEMS.length - 1, focusedRailIndex(s) + delta))
  return { patch: { focus: RAIL_ITEMS[next]!.id, hover: '', message: '' } }
}
