import { describe, expect, it } from 'vitest'
import type { WorkspaceAccount, WorkspaceSnapshot } from '../../../contract/index.js'
import type { Canvas } from '../draw/canvas.js'
import { workspaceFrame } from '../frame.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import { accountUi } from './account-model.js'
import { qrRows } from './pairing-dialog.js'

const account = (over: Partial<WorkspaceAccount> = {}): WorkspaceAccount => ({
  enabled: true,
  signed_in: true,
  user: { email: 'ann@example.com', display_name: null },
  sign_in: { state: 'idle' },
  remote: {
    sharing: true,
    host_name: null,
    tunnel: 'online',
    lan: false,
    addresses: 1,
    pairing: { expires_at: 600_000 },
    requests: [],
    devices: [
      { grant_id: 'd1', device_name: 'Home PC', platform: 'windows', since: 1 },
      { grant_id: 'd2', device_name: null, platform: 'ios', since: 1 },
    ],
    error: null,
  },
  ...over,
})
const pairing = {
  code: 'BCDF-GHJK',
  link: 'atomic-chat://remote/pair?c=BCDF-GHJK&k=Q2xhdWRlIHdhcyBoZXJlIGFuZCBsZWZ0IGEga2V5IGZvciB5b3U',
  expires_at: 600_000,
  qr_svg: '<svg/>',
}
const dialog = (overlay: WorkspaceState['overlay'], a = account(), ui = {}): WorkspaceState => ({
  ...createWorkspace('server'),
  setupComplete: true,
  serverView: 'remote',
  overlay,
  focus: 'close',
  workspace: {
    api: { running: true, host: '127.0.0.1', port: 1337, prefix: '/v1', endpoint: '' },
    keys: [],
    setups: [],
    downloads: [],
    account: a,
  } as unknown as WorkspaceSnapshot,
  accountUi: { ...accountUi({}), now: 2_000, pairing, ...ui },
})
const screen = (c: Canvas) => c.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
const ids = (c: Canvas) => c.targets.map((t) => t.id)

describe('Add a device', () => {
  it('shows the code, its countdown, the link and the QR code', () => {
    const c = workspaceFrame(dialog('account-pairing'), 100, 30, 0)
    const text = screen(c)
    expect(text).toContain('Add a device')
    expect(text).toContain('BCDF-GHJK')
    expect(text).toContain('Expires in 9:58')
    expect(text).toContain('atomic-chat://remote/pair')
    for (const row of qrRows(pairing.link)) expect(text).toContain(row)
    expect(ids(c)).toEqual(expect.arrayContaining(['account-pair-copy', 'account-pair-code']))
    expect(c.popover).toBeDefined()
  })

  it('leaves the QR code out of a terminal too small for it, and says so', () => {
    const text = screen(workspaceFrame(dialog('account-pairing'), 80, 24, 0))
    expect(text).toContain('BCDF-GHJK')
    expect(text).toContain('Make the terminal larger to show the QR code.')
    expect(text).not.toContain(qrRows(pairing.link)[1])
  })

  it('offers a new code once this one expired', () => {
    const c = workspaceFrame(dialog('account-pairing', account(), { now: 700_000 }), 100, 30, 0)
    expect(screen(c)).toContain('This code expired.')
    expect(ids(c)).toContain('account-pair')
    expect(ids(c)).not.toContain('account-pair-copy')
  })

  it('makes the QR code once per link', () => {
    expect(qrRows(pairing.link)).toBe(qrRows(pairing.link))
    expect(qrRows(pairing.link).length).toBeGreaterThan(10)
  })
})

describe('sign-in dialogs', () => {
  it('asks for the email address, then for the code sent to it', () => {
    const email = dialog('account-email', account({ signed_in: false, user: null }), {
      email: 'ann@example.com',
    })
    const first = workspaceFrame({ ...email, focus: 'account-field' }, 100, 30, 0)
    expect(screen(first)).toContain('Email address')
    expect(screen(first)).toContain('ann@example.com_')
    expect(ids(first)).toEqual(expect.arrayContaining(['account-field', 'account-email-send']))
    const code = {
      ...email,
      accountUi: {
        ...email.accountUi!,
        step: 'code' as const,
        code: '12',
        error: 'Wrong code; 4 attempts left.',
      },
    }
    const second = workspaceFrame(code, 100, 30, 0)
    expect(screen(second)).toContain('We sent a 6-digit code to ann@example.com.')
    expect(screen(second)).toContain('Wrong code; 4 attempts left.')
    expect(ids(second)).toEqual(expect.arrayContaining(['account-email-verify', 'account-email-back']))
  })

  it('shows the code, the page to enter it on and the whole link for another device', () => {
    const waiting = account({
      signed_in: false,
      user: null,
      sign_in: {
        state: 'device',
        user_code: 'WXYZ-1234',
        verification_uri: 'https://atomic.chat/activate',
        verification_uri_complete: 'https://atomic.chat/activate?code=WXYZ-1234',
        expires_at: 902_000,
      },
    })
    const text = screen(workspaceFrame(dialog('account-device', waiting), 100, 30, 0))
    expect(text).toContain('https://atomic.chat/activate?code=WXYZ-1234')
    expect(text).toContain('or open https://atomic.chat/activate and enter the code')
    expect(text).toContain('WXYZ-1234')
    expect(text).toContain('the code expires in 15:00')
  })

  it('says why a sign-in on another device failed and offers another try', () => {
    const failed = account({
      signed_in: false,
      user: null,
      sign_in: { state: 'failed', reason: 'expired', message: 'The sign-in code expired. Start again.' },
    })
    const c = workspaceFrame(dialog('account-device', failed), 100, 30, 0)
    expect(screen(c)).toContain('The sign-in code expired. Start again.')
    expect(ids(c)).toContain('account-device-retry')
  })
})

describe('confirmations', () => {
  it('warns how many devices lose access when signing out', () => {
    const c = workspaceFrame(dialog('account-signout'), 100, 30, 0)
    expect(screen(c)).toContain('2 devices will lose access to this server')
    expect(ids(c)).toContain('account-signout-confirm')
  })

  it('names the device a revoke is for', () => {
    const c = workspaceFrame(dialog('account-revoke', account(), { grant: 'd1' }), 100, 30, 0)
    expect(screen(c)).toContain('Home PC loses access to this server from its next request.')
    expect(ids(c)).toContain('account-revoke-confirm')
  })
})
