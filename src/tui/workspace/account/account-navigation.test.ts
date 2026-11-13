import { describe, expect, it, vi } from 'vitest'
import type { Key } from 'ink'
import type { WorkspaceAccount, WorkspaceSnapshot } from '../../../contract/index.js'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import type { Canvas } from '../draw/canvas.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { applyWorkspaceSnapshot } from '../runtime/shared-state.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import { accountIcon, accountRailItem, leaveAccountPage } from './account-navigation.js'

const account = (over: Partial<WorkspaceAccount> = {}): WorkspaceAccount => ({
  enabled: true,
  signed_in: true,
  user: { email: 'ann@example.com', display_name: 'Ann' },
  sign_in: { state: 'idle' },
  remote: {
    sharing: false,
    host_name: null,
    tunnel: 'off',
    lan: false,
    addresses: 0,
    pairing: null,
    requests: [],
    devices: [],
    ended: [],
    error: null,
  },
  ...over,
})
const snapshot = (a?: WorkspaceAccount) =>
  ({ keys: [], setups: [], downloads: [], ...(a ? { account: a } : {}) }) as unknown as WorkspaceSnapshot
const start = (a: WorkspaceAccount | undefined, patch: Partial<WorkspaceState> = {}): WorkspaceState => ({
  ...createWorkspace('server'),
  setupComplete: true,
  workspace: snapshot(a),
  ...patch,
})
function fixture(s: WorkspaceState) {
  let state = s
  const ctx = {
    get: () => state,
    update: (fn: (v: WorkspaceState) => WorkspaceState) => {
      state = fn(state)
    },
    controller: { runtime: { execute: vi.fn() } },
  } as unknown as ActionContext
  return { ctx, get: () => state }
}
const screen = (c: Canvas) => c.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')

describe('the rail item', () => {
  it.each([
    ['signed out', account({ signed_in: false, user: null }), '(o)'],
    ['by its name', account(), '(A)'],
    ['by its email without a name', account({ user: { email: 'misha@x.io', display_name: null } }), '(M)'],
    ['by its email when the name is blank', account({ user: { email: 'z@x.io', display_name: ' ' } }), '(Z)'],
    ['in any script', account({ user: { email: 'm@x.io', display_name: 'мария' } }), '(М)'],
  ])('shows the account %s as %s', (_name, a, icon) => {
    expect(accountIcon(a)).toBe(icon)
  })

  it('is there only while accounts are on', () => {
    expect(accountRailItem(snapshot(account()))).toEqual({
      id: 'page:account',
      label: 'Account',
      icon: '(A)',
    })
    expect(accountRailItem(snapshot(account({ enabled: false })))).toBeNull()
    expect(accountRailItem(snapshot())).toBeNull()
    expect(accountRailItem(null)).toBeNull()
  })
})

describe('opening the Account page', () => {
  it.each([
    ['account-section:overview', 'overview'],
    ['account-section:remote', 'remote'],
  ] as const)('%s opens its tab on its sidebar row', async (id, view) => {
    const t = fixture(start(account(), { overlay: 'sections', message: 'old' }))
    await activate(id, t.ctx)
    expect(t.get()).toMatchObject({
      page: 'account',
      accountView: view,
      serverView: 'overview',
      overlay: null,
      focus: id,
      message: '',
    })
  })

  it('page:account opens the tab that was open last', async () => {
    const t = fixture(start(account(), { accountView: 'remote' }))
    await activate('page:account', t.ctx)
    expect(t.get()).toMatchObject({ page: 'account', accountView: 'remote', focus: 'account-section:remote' })
  })

  it.each([
    ['before setup is complete', start(account(), { setupComplete: false }), 'account-section:remote'],
    ['while accounts are off', start(account({ enabled: false })), 'page:account'],
    ['for a tab it does not have', start(account()), 'account-section:devices'],
  ])('does nothing %s', async (_name, s, id) => {
    const t = fixture(s)
    await activate(id, t.ctx)
    expect(t.get().page).toBe('server')
  })

  it('switches tabs from the sidebar with the keyboard and the mouse', () => {
    let s = start(account(), { page: 'account', focus: 'account-section:overview' })
    const frame = workspaceFrame(s, 120, 40, 0)
    const row = frame.targets.find((t) => t.id === 'account-section:remote')!
    const click = workspaceInput(`[<0;${row.x + 1};${row.y + 1}M`, {} as Key, s, frame)
    expect(click.action).toBe('account-section:remote')
    s = { ...s, focus: 'account-section:remote' }
    expect(workspaceInput('', { return: true } as Key, s, frame).action).toBe('account-section:remote')
  })

  it('lists the tabs in the compact Sections dialog', async () => {
    const t = fixture(start(account(), { page: 'account' }))
    await activate('section-menu', t.ctx)
    expect(t.get()).toMatchObject({ overlay: 'sections', focus: 'account-section:overview' })
    const text = screen(workspaceFrame(t.get(), 80, 24, 0))
    expect(text).toContain('Account')
    expect(text).toContain('Remote models')
  })
})

describe('accounts turned off while the Account page is open', () => {
  const open = start(account(), { page: 'account', accountView: 'remote', overlay: 'account-pairing' })

  it('falls back to the Server page and closes the account dialog', () => {
    const off = { ...open, workspace: snapshot(account({ enabled: false })) }
    expect(leaveAccountPage(off)).toMatchObject({
      page: 'server',
      serverView: 'overview',
      overlay: null,
      focus: 'api-toggle',
    })
    expect(leaveAccountPage(open)).toBe(open)
    const elsewhere = { ...off, page: 'chat' as const }
    expect(leaveAccountPage(elsewhere)).toBe(elsewhere)
  })

  it('leaves with the next snapshot, and is never drawn empty before it', () => {
    expect(applyWorkspaceSnapshot(open, snapshot(account({ enabled: false })), 1).page).toBe('server')
    expect(applyWorkspaceSnapshot(open, snapshot(account()), 1).page).toBe('account')
    const text = screen(workspaceFrame({ ...open, overlay: null, workspace: snapshot() }, 110, 32, 0))
    expect(text).toContain('Agents & tools')
    expect(text).not.toContain('Share with your devices')
  })
})
