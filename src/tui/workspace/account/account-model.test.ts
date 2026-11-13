import { describe, expect, it } from 'vitest'
import type { AccountRemoteEnded, WorkspaceAccount, WorkspaceSnapshot } from '../../../contract/index.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import {
  accountArrived,
  accountNotice,
  accountUi,
  announceEnded,
  deviceDetail,
  isAccountOverlay,
  onAccountTab,
  pairedDevice,
  setupAccountHint,
  shownAccount,
  signedIn,
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
    ended: [],
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
    expect(isAccountOverlay('account-stop-sharing')).toBe(true)
    expect(isAccountOverlay('help')).toBe(false)
    expect(isAccountOverlay(null)).toBe(false)
  })

  it('names a device by its platform only when it has a name, and since when it has access', () => {
    expect(deviceDetail(device)).toBe('Windows · since 2026-11-10')
    expect(deviceDetail({ ...device, device_name: null, since: 0 })).toBe('')
  })
})

describe('landing on the Account page', () => {
  it('opens a tab on its sidebar row, or on the control given', () => {
    expect(onAccountTab('remote')).toEqual({
      page: 'account',
      accountView: 'remote',
      serverView: 'overview',
      focus: 'account-section:remote',
      hover: '',
    })
    expect(onAccountTab('overview', 'account-email')).toMatchObject({ focus: 'account-email' })
  })

  it.each([
    ['Overview', 'overview', 'account-section:remote'],
    ['Remote models', 'remote', 'account-share'],
  ] as const)('keeps a sign-in started on %s there, on what comes next', (_name, view, focus) => {
    const s = { ...createWorkspace('account'), accountView: view, overlay: 'account-email' as const }
    expect(signedIn(s, account())).toMatchObject({
      page: 'account',
      accountView: view,
      focus,
      overlay: null,
      message: 'Signed in as Ann.',
    })
  })

  it('lands a sign-in from anywhere else on Overview', () => {
    expect(signedIn(createWorkspace('server'), account())).toMatchObject({
      page: 'account',
      accountView: 'overview',
    })
  })
})

describe('a fresh account status', () => {
  it('ends the device sign-in once the server is signed in, on the tab it started on', () => {
    const before = waiting('account-device', account({ signed_in: false, user: null }))
    const after = accountArrived({ ...before, page: 'account', accountView: 'remote' }, account(), 5)
    expect(after).toMatchObject({
      page: 'account',
      accountView: 'remote',
      overlay: null,
      message: 'Signed in as Ann.',
      focus: 'account-share',
    })
    expect(after.workspace?.account?.signed_in).toBe(true)
  })

  it('closes the pairing code once it is used: closed by the server and a new device has access', () => {
    const before = waiting('account-pairing', account())
    const used = account({ remote: { ...account().remote, devices: [device] } })
    expect(pairedDevice(before.accountUi!, used)).toEqual(device)
    expect(accountArrived(before, used, 5)).toMatchObject({
      page: 'account',
      accountView: 'remote',
      focus: 'account-pair',
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

describe('devices whose access ended from their side', () => {
  const mac = { grant_id: 'g1', device_name: 'Work MacBook', platform: 'macos', at: 3_000 }
  const phone = { grant_id: 'g2', device_name: null, platform: 'ios', at: 2_000 }
  const old = { grant_id: 'g3', device_name: 'Home PC', platform: 'windows', at: 1_000 }
  const key = (e: AccountRemoteEnded) => `${e.grant_id}@${e.at}`
  const MAC = 'Work MacBook disconnected from this server.'
  const at = (
    list: AccountRemoteEnded[],
    patch: Partial<WorkspaceState> = {},
    over = {}
  ): WorkspaceState => ({
    ...createWorkspace('server'),
    workspace: snapshot(account({ remote: { ...account().remote, ended: list }, ...over })),
    ...patch,
  })
  const notice = { message: 'Reply failed.', details: '', conflict: false }

  it.each([
    ['the first account this terminal sees: old news', '', at([mac, old]), '', [key(mac), key(old)]],
    ['a new device', '', at([mac], { accountEnded: [] }), MAC, [key(mac)]],
    [
      'several new: the newest, and how many more',
      '',
      at([phone, mac, old], { accountEnded: [key(old)] }),
      'Work MacBook disconnected from this server (and 1 more).',
      [key(phone), key(mac), key(old)],
    ],
    [
      'a device by its platform',
      '',
      at([phone], { accountEnded: [] }),
      'iOS disconnected from this server.',
      [key(phone)],
    ],
    ['the same device again later', '', at([mac], { accountEnded: ['g1@1'] }), MAC, [key(mac)]],
    [
      'nothing new; what left the list is forgotten',
      '',
      at([mac], { accountEnded: [key(mac), key(old)] }),
      '',
      [key(mac)],
    ],
    [
      'a dialog on screen: it waits',
      '',
      at([mac, old], { accountEnded: [key(old)], overlay: 'help' }),
      '',
      [key(old)],
    ],
    [
      'a chat notice over the status line: it waits',
      '',
      at([mac], { accountEnded: [], page: 'chat', chatNotice: notice }),
      '',
      [],
    ],
    [
      'this update set its own message: it waits',
      '',
      at([mac], { accountEnded: [], message: 'Sharing is off.' }),
      'Sharing is off.',
      [],
    ],
    [
      'a message from an earlier update gives way',
      'Signed out.',
      at([mac], { accountEnded: [], message: 'Signed out.' }),
      MAC,
      [key(mac)],
    ],
    ['accounts off: nothing', '', at([mac], { accountEnded: [] }, { enabled: false }), '', []],
  ])('%s', (_name, message, next, said, remembered) => {
    const after = announceEnded({ ...next, message }, next)
    expect(after.message).toBe(said)
    expect(after.accountEnded).toEqual(remembered)
  })

  it('says a device that disconnected behind a dialog once the dialog is gone', () => {
    const open = announceEnded(at([]), at([mac], { accountEnded: [], overlay: 'account-pairing' }))
    expect(open.message).toBe('')
    // Closing a dialog clears the message; the next update says what waited, and only once.
    const closed = { ...open, overlay: null, message: '' }
    const said = announceEnded(closed, closed)
    expect(said.message).toBe(MAC)
    expect(announceEnded({ ...said, message: '' }, { ...said, message: '' }).message).toBe('')
  })

  it('lets a used pairing code say so first, and says the device that disconnected next', () => {
    const before = { ...waiting('account-pairing', account()), accountEnded: [] }
    const used = account({ remote: { ...account().remote, devices: [device], ended: [mac] } })
    const paired = accountArrived(before, used, 5)
    expect(paired).toMatchObject({
      overlay: null,
      message: 'Home PC can now use this server.',
      accountEnded: [],
    })
    expect(accountArrived(paired, used, 6).message).toBe(MAC)
  })
})
