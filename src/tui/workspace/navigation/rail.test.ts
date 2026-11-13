import type { Key } from 'ink'
import { expect, it } from 'vitest'
import type { WorkspaceAccount, WorkspaceSnapshot } from '../../../contract/index.js'
import { canvas } from '../draw/canvas.js'
import { workspaceInput } from '../input.js'
import { createWorkspace } from '../state.js'
import { drawRail } from './sidebar.js'
import { RAIL_ITEMS, railInput, railItems } from './rail.js'

const key = (value: Partial<Key> = {}) => value as Key
const frame = (s: ReturnType<typeof createWorkspace>, width: number, height: number, top: number) => {
  const c = canvas(width, height)
  c.contentTop = top
  drawRail(c, s, height - 4, s.focus)
  return c
}
const accounts = (s: ReturnType<typeof createWorkspace>, over: Partial<WorkspaceAccount> = {}) => {
  s.workspace = {
    keys: [],
    account: { enabled: true, signed_in: false, user: null, ...over },
  } as unknown as WorkspaceSnapshot
  return s
}

it.each([
  [90, 24, 12, false],
  [90, 24, 7, false],
  [90, 32, 7, false],
  [90, 24, 12, true],
  [90, 24, 7, true],
  [90, 32, 7, true],
])('keeps every rail destination reachable at %i×%i with a %i-row header (accounts %s)', (...args) => {
  const [width, height, top, on] = args
  const s = on ? accounts(createWorkspace('server')) : createWorkspace('server')
  const items = railItems(s)
  expect(items).toHaveLength(on ? 7 : 6)
  s.focus = items[0]!.id
  for (const item of items) {
    const c = frame(s, width, height, top)
    expect(s.focus).toBe(item.id)
    expect(c.targets.some((target) => target.id === item.id)).toBe(true)
    expect(workspaceInput('', key({ return: true }), s, c).action).toBe(item.id)
    c.targets.forEach((target, i) => {
      expect(target.height).toBe(2)
      expect(target.y).toBeGreaterThan(top)
      expect(target.y + target.height).toBeLessThanOrEqual(height - 4)
      if (i) expect(target.y).toBeGreaterThan(c.targets[i - 1]!.y + 2)
    })
    for (const y of [top, height - 4])
      expect(c.cells[y]!.slice(0, 13).every((cell) => !cell.char.trim())).toBe(true)
    const next = workspaceInput('', key({ downArrow: true }), s, c)
    expect(next.action).toBeUndefined()
    Object.assign(s, next.patch)
  }
  for (const item of [...items].reverse()) {
    expect(s.focus).toBe(item.id)
    const c = frame(s, width, height, top)
    expect(c.targets.some((target) => target.id === item.id)).toBe(true)
    Object.assign(s, workspaceInput('', key({ upArrow: true }), s, c).patch)
  }
})

it('scrolls the rail under the mouse without navigating or scrolling the page content', () => {
  const s = createWorkspace('server')
  s.mouse = true
  s.focus = 'server-agent:0'
  for (let i = 0; i < 5; i++) {
    const c = frame(s, 90, 24, 12)
    const result = workspaceInput('[<65;5;15M', key(), s, c)
    expect(result.action).toBeUndefined()
    Object.assign(s, result.patch)
  }
  expect(s.focus).toBe('page:access')
  expect(s.page).toBe('server')
  const c = frame(s, 90, 24, 12)
  const target = c.targets.find((item) => item.id === 'page:access')!
  expect(workspaceInput(`[<0;5;${target.y + 1}M`, key(), s, c).action).toBe('page:access')
  expect(railInput('[<65;30;15M', key(), s, c)).toBeNull()
  s.overlay = 'help'
  expect(railInput('[<65;5;15M', key(), s, c)).toBeNull()
})

it('lists Account at the top of the bottom group only while accounts are on', () => {
  expect(railItems(createWorkspace('server'))).toBe(RAIL_ITEMS)
  expect(railItems(accounts(createWorkspace('server'), { enabled: false }))).toBe(RAIL_ITEMS)
  const s = accounts(createWorkspace('server'))
  expect(railItems(s).map((item) => item.id)).toEqual([
    'page:server',
    'page:chat',
    'page:models',
    'page:account',
    'help',
    'open-admin',
    'page:access',
  ])
  for (const height of [32, 40]) {
    const c = frame(s, 90, height, 3)
    const at = (id: string) => c.targets.find((t) => t.id === id)!.y
    expect(at('help') - at('page:account')).toBe(3)
    expect(at('page:account') - at('page:models')).toBeGreaterThan(3)
    expect(at('page:access') + 2).toBe(height - 4)
  }
})

it.each([
  ['signed out', {}, '(o)'],
  ['signed in with a name', { signed_in: true, user: { email: 'z@x.io', display_name: 'misha' } }, '(M)'],
  ['signed in without one', { signed_in: true, user: { email: 'ann@x.io', display_name: null } }, '(A)'],
])('draws the account %s as %s and marks the open Account page', (_name, over, icon) => {
  const s = accounts(createWorkspace('account'), over)
  const c = frame(s, 90, 32, 3)
  const target = c.targets.find((t) => t.id === 'page:account')!
  const row = (y: number) =>
    c.cells[y]!.slice(0, 13)
      .map((cell) => cell.char)
      .join('')
  expect(row(target.y)).toContain(icon)
  expect(row(target.y)).toContain('*')
  expect(row(target.y + 1)).toContain('Account')
})

it.each([
  [80, 'Account'],
  [60, '(o)'],
  [54, null],
])('puts Account after the numbered pages of the compact row at %i columns', (width, label) => {
  const s = accounts(createWorkspace('server'))
  s.focus = 'page:access'
  const c = canvas(width, 24)
  drawRail(c, s, 20, s.focus)
  const row = c.targets.filter((t) => t.y === c.targets[0]!.y)
  expect(row.map((t) => t.id).slice(0, 4)).toEqual(['page:server', 'page:chat', 'page:models', 'page:access'])
  const account = row.find((t) => t.id === 'page:account')
  if (!label) return expect(account).toBeUndefined()
  expect(account!.x + account!.width).toBeLessThanOrEqual(width)
  const shown = c.cells[account!.y]!.slice(account!.x, account!.x + account!.width).map((v) => v.char)
  expect(shown.join('').trim()).toBe(label)
  // No Alt number: Right from Settings reaches it, and Right again goes round to Server.
  const right = railInput('', key({ rightArrow: true }), s, c)
  expect(right?.patch?.focus).toBe('page:account')
  expect(railInput('', key({ rightArrow: true }), { ...s, focus: 'page:account' }, c)?.patch?.focus).toBe(
    'page:server'
  )
})
