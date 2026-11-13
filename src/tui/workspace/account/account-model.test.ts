import { describe, expect, it } from 'vitest'
import type { WorkspaceAccount, WorkspaceSnapshot } from '../../../contract/index.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import {
  accountArrived,
  accountNotice,
  accountUi,
  deviceDetail,
  isAccountOverlay,
  pairedDevice,
  settingsSections,
  setupAccountHint,
  shownAccount,
} from './account-model.js'

const account = (over: Partial<WorkspaceAccount> = {}): WorkspaceAccount => ({
  enabled: true,
  signed_in: true,
  user: { email: 'ann@example.com', display_name: 'Ann' },
  sign_in: { state: 'idle' },
  remote: {
    sharing: true,
    host_name: 'studio',
    tunnel: 'online',
    lan: false,
    addresses: 1,
    pairing: null,
    requests: [],
    devices: [],
    error: null,
  },
  ...over,
})
const request = {
  grant_id: 'g1',
  device_name: 'Work MacBook',
  platform: 'macos',
  client_type: 'desktop',
  check_code: '123456',
  created_at: '2026-11-12T10:00:00Z',
}
const device = { grant_id: 'g2', device_name: 'Home PC', platform: 'windows', since: Date.UTC(2026, 10, 10) }
const snapshot = (a?: WorkspaceAccount) =>
  ({ keys: [], ...(a ? { account: a } : {}) }) as unknown as WorkspaceSnapshot
const pairing = {
  code: 'BCDF-GHJK',
  link: 'atomic-chat://remote/pair?c=BCDF-GHJK&k=x',
  expires_at: 9e9,
  qr_svg: '',
}
const waiting = (overlay: WorkspaceState['overlay'], a: WorkspaceAccount): WorkspaceState => ({
  ...createWorkspace('server'),
  overlay,
  workspace: snapshot(a),
  accountUi: { ...accountUi({}), pairing, known: ['g0'] },
})

describe('what the terminal may show of the account', () => {
  it.each([
    ['no snapshot', null, false],
    ['a snapshot without an account (not a server)', snapshot(), false],
    ['accounts off', snapshot(account({ enabled: false })), false],
    ['accounts on', snapshot(account()), true],
  ])('%s', (_name, workspace, shown) => {
    expect(shownAccount(workspace) !== null).toBe(shown)
    expect(settingsSections(workspace).some((section) => section.id === 'account')).toBe(shown)
    // Everything else stays in its order.
    expect(settingsSections(workspace).map((section) => section.id)).toEqual(
      expect.arrayContaining(['admin', 'shortcuts', 'hardware', 'assistants', 'connectors', 'skills'])
    )
  })

  it.each([
    ['off', account({ enabled: false, signed_in: false, user: null }), null, null],
    [
      'signed out',
      account({ signed_in: false, user: null }),
      'Share this server with your devices: atc login',
      null,
    ],
    ['signed in, nobody asks', account(), null, null],
    [
      'signed in, a device asks',
      account({ remote: { ...account().remote, requests: [request] } }),
      null,
      'Work MacBook asks for access to this server — check code 123456',
    ],
  ])('%s: setup hint and status notice', (_name, a, hint, notice) => {
    expect(setupAccountHint(snapshot(a))).toBe(hint)
    expect(accountNotice(snapshot(a))).toBe(notice)
  })

  it('knows its dialogs', () => {
    expect(isAccountOverlay('account-pairing')).toBe(true)
    expect(isAccountOverlay('help')).toBe(false)
    expect(isAccountOverlay(null)).toBe(false)
  })

  it('names a device by its platform only when it has a name, and since when it has access', () => {
    expect(deviceDetail(device)).toBe('Windows · since 2026-11-10')
    expect(deviceDetail({ ...device, device_name: null, since: 0 })).toBe('')
  })
})

describe('a fresh account status', () => {
  it('ends the device sign-in once the server is signed in', () => {
    const before = waiting('account-device', account({ signed_in: false, user: null }))
    const after = accountArrived(before, account(), 5)
    expect(after).toMatchObject({
      overlay: null,
      message: 'Signed in as Ann.',
      focus: 'server-section:remote',
    })
    expect(after.workspace?.account?.signed_in).toBe(true)
  })

  it('closes the pairing code once it is used: closed by the server and a new device has access', () => {
    const before = waiting('account-pairing', account())
    const used = account({ remote: { ...account().remote, devices: [device] } })
    expect(pairedDevice(before.accountUi!, used)).toEqual(device)
    expect(accountArrived(before, used, 5)).toMatchObject({
      overlay: null,
      message: 'Home PC can now use this server.',
      accountUi: { pairing: null, known: [] },
    })
  })

  it.each([
    ['still open', { pairing: { expires_at: 9e9 }, devices: [device] }],
    ['closed, nobody new', { pairing: null, devices: [] }],
    ['closed, a device that was there before', { pairing: null, devices: [{ ...device, grant_id: 'g0' }] }],
  ])('keeps the pairing code on screen while it is %s, ticking its clock', (_name, remote) => {
    const before = waiting('account-pairing', account())
    const after = accountArrived(before, account({ remote: { ...account().remote, ...remote } }), 7)
    expect(after.overlay).toBe('account-pairing')
    expect(after.accountUi).toMatchObject({ pairing, now: 7 })
  })
})
