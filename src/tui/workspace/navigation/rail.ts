import { PAGES } from '../workspace-pages.js'
import type { Key } from 'ink'
import type { Canvas } from '../draw/canvas.js'
import { textWidth } from '../draw/canvas.js'
import type { InputResult } from '../input-types.js'
import type { WorkspaceState } from '../state.js'
import { workspaceHeaderRows } from '../draw/brand-header.js'
import { mouseReport } from '../input/mouse-report.js'
import { accountRailItem } from '../account/account-navigation.js'
import { workspacePage } from './navigation.js'

export interface RailItem {
  id: string
  label: string
  icon: string
}

const TOP_ITEMS: readonly RailItem[] = [
  { id: 'page:server', label: 'Server', icon: '[=]' },
  { id: 'page:chat', label: 'Playground', icon: '>_' },
  { id: 'page:models', label: 'Models', icon: '[#]' },
]
const BOTTOM_ITEMS: readonly RailItem[] = [
  { id: 'help', label: 'Help', icon: '(?)' },
  { id: 'open-admin', label: 'Web', icon: '[@]' },
  { id: 'page:access', label: 'Settings', icon: '(*)' },
]
/** The rail while accounts are off. */
export const RAIL_ITEMS: readonly RailItem[] = [...TOP_ITEMS, ...BOTTOM_ITEMS]

/** The rail's destinations: Account tops the bottom group while accounts are on, as in the desktop app. */
export function railItems(s: Pick<WorkspaceState, 'workspace'>): readonly RailItem[] {
  const account = accountRailItem(s.workspace)
  return account ? [...TOP_ITEMS, account, ...BOTTOM_ITEMS] : RAIL_ITEMS
}

function focusedRailIndex(s: WorkspaceState, items: readonly RailItem[]) {
  const focused = items.findIndex((item) => item.id === s.focus)
  return focused < 0 ? items.findIndex((item) => item.id === `page:${workspacePage(s)}`) : focused
}

/** Keep two-line controls and blank margins; short rails reveal the focused item. */
export function railLayout(c: Canvas, s: WorkspaceState, bottom: number) {
  const top = workspaceHeaderRows(c),
    all = railItems(s),
    split = TOP_ITEMS.length
  const count = Math.max(1, Math.min(all.length, Math.floor((bottom - top) / 3)))
  const start = Math.max(0, Math.min(all.length - count, focusedRailIndex(s, all) - count + 1))
  // With room for every item, the bottom group sits on the bottom edge.
  const pinned = bottom - 3 * (all.length - split) + 1
  const items = all.slice(start, start + count).map((item, index) => ({
    ...item,
    y: count === all.length && index >= split ? pinned + (index - split) * 3 : top + 1 + index * 3,
  }))
  return { top, start, count, total: all.length, items }
}

/**
 * The compact top row: the four numbered pages, then Account (no Alt number) while accounts are on and
 * the row has room for it.
 */
export function compactRow(c: Canvas, s: Pick<WorkspaceState, 'workspace'>) {
  let x = 2
  const row = PAGES.map((page, i) => {
    const item = { id: `page:${page.id}`, label: `${i + 1} ${page.name}`, hint: page.hint, x }
    x += textWidth(item.label) + 3
    return item
  })
  // A narrow row keeps the account's icon, `(M)`, instead of its name; a narrower one has no room for it.
  const account = accountRailItem(s.workspace),
    label = [account?.label, account?.icon].find((v) => v && x + textWidth(v) + 2 <= c.width)
  if (account && label) row.push({ id: account.id, label, hint: 'Account', x })
  return row
}

/** Scrolling moves focus only; Enter or a click activates the selected destination. */
export function railInput(input: string, key: Key, s: WorkspaceState, frame: Canvas): InputResult | null {
  if (s.overlay || s.page === 'welcome' || s.page === 'setup') return null
  if (frame.width < 90) {
    const row = compactRow(frame, s),
      index = row.findIndex((item) => item.id === s.focus)
    if (index < 0 || !(key.leftArrow || key.rightArrow)) return null
    const next = (index + (key.leftArrow ? -1 : 1) + row.length) % row.length
    return { patch: { focus: row[next]!.id, hover: '' } }
  }
  const mouse = mouseReport(input)
  const wheel = Boolean(
    mouse &&
    s.mouse &&
    mouse.code & 64 &&
    mouse.x < 14 &&
    mouse.y >= workspaceHeaderRows(frame) &&
    mouse.y <= frame.height - 4
  )
  const items = railItems(s),
    focused = items.some((item) => item.id === s.focus)
  if (!wheel && !(focused && (key.upArrow || key.downArrow || key.pageUp || key.pageDown))) return null
  const delta = wheel ? (mouse!.code & 1 ? 1 : -1) : key.upArrow || key.pageUp ? -1 : 1
  const next = Math.max(0, Math.min(items.length - 1, focusedRailIndex(s, items) + delta))
  return { patch: { focus: items[next]!.id, hover: '', message: '' } }
}
