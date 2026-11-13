import { describe, expect, it } from 'vitest'
import type { WorkspaceAccount, WorkspaceSnapshot } from '../../../contract/index.js'
import type { Canvas } from '../draw/canvas.js'
import { workspaceFrame } from '../frame.js'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import { shortcutRows } from '../server/settings-special.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import { devicesLine } from './account-panel.js'

const account = (over: Partial<WorkspaceAccount> = {}): WorkspaceAccount => ({
  enabled: true,
  signed_in: false,
  user: null,
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
    error: null,
  },
  ...over,
})
const settings = (a: WorkspaceAccount, group = 'account'): WorkspaceState => ({
  ...createWorkspace('access'),
  setupComplete: true,
  settingsGroup: group,
  workspace: { keys: [], account: a } as unknown as WorkspaceSnapshot,
})
const screen = (c: Canvas) => c.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
const ids = (c: Canvas) => c.targets.map((t) => t.id)

describe('Settings → Account', () => {
  it('offers both ways to sign in while signed out', () => {
    const c = workspaceFrame(settings(account()), 120, 36, 0)
    expect(screen(c)).toContain('Not signed in')
    expect(screen(c)).toContain('Email me a code')
    expect(screen(c)).toContain('Sign in on another device')
    expect(ids(c)).toEqual(
      expect.arrayContaining(['account-email', 'account-device', 'settings-section:account'])
    )
    expect(ids(c)).not.toContain('account-signout')
  })

  it.each([
    [
      'a code in the email',
      { state: 'email_sent', expires_at: 1, resend_at: 1 } as const,
      'Enter the code',
      'account-email-code',
    ],
    [
      'a sign-in waiting for approval',
      {
        state: 'device',
        user_code: 'A',
        verification_uri: 'u',
        verification_uri_complete: 'u?A',
        expires_at: 1,
      } as const,
      'Show the sign-in code',
      'account-device',
    ],
    [
      'a failed sign-in',
      { state: 'failed', reason: 'denied', message: 'The sign-in was declined.' } as const,
      'The sign-in was declined.',
      'account-email',
    ],
  ])('says so when there is %s', (_name, sign_in, words, id) => {
    const c = workspaceFrame(settings(account({ sign_in })), 120, 36, 0)
    expect(screen(c)).toContain(words)
    expect(ids(c)).toContain(id)
  })

  it('shows who is signed in, the devices and Sign out', () => {
    const signedIn = account({
      signed_in: true,
      user: { email: 'ann@example.com', display_name: 'Ann' },
      remote: {
        ...account().remote,
        sharing: true,
        tunnel: 'online',
        addresses: 1,
        devices: [{ grant_id: 'd1', device_name: null, platform: 'ios', since: 1 }],
      },
    })
    const c = workspaceFrame(settings(signedIn), 120, 36, 0)
    for (const words of [
      'Signed in as Ann',
      'ann@example.com',
      'Shared with your devices over the internet',
      '1 device with access',
      'Devices lose access and must pair again.',
    ])
      expect(screen(c)).toContain(words)
    expect(ids(c)).toEqual(expect.arrayContaining(['account-signout', 'server-section:remote']))
  })

  it('counts devices and requests', () => {
    const request = {
      grant_id: 'r',
      device_name: null,
      platform: null,
      client_type: 'desktop',
      check_code: '1',
      created_at: '',
    }
    expect(devicesLine(account())).toBe('No devices yet')
    expect(devicesLine(account({ remote: { ...account().remote, requests: [request, request] } }))).toBe(
      'No devices yet · 2 asking for access'
    )
  })
})

describe('while accounts are off', () => {
  const off = account({ enabled: false })

  it('has no Account section and no account shortcuts', () => {
    const on = workspaceFrame(settings(account(), 'shortcuts'), 120, 36, 0)
    const hidden = workspaceFrame(settings(off, 'shortcuts'), 120, 36, 0)
    expect(ids(on)).toContain('settings-section:account')
    expect(ids(hidden)).not.toContain('settings-section:account')
    expect(screen(hidden)).not.toContain('Account')
    expect(shortcutRows(settings(account())).map(([key]) => key)).toEqual(expect.arrayContaining(['A', 'S']))
    expect(shortcutRows(settings(off)).map(([key]) => key)).not.toContain('A')
  })

  it('does not open Account', async () => {
    let state = settings(off, 'admin')
    const ctx = {
      get: () => state,
      update: (fn: (s: WorkspaceState) => WorkspaceState) => {
        state = fn(state)
      },
    } as unknown as ActionContext
    await activate('settings-section:account', ctx)
    expect(state.settingsGroup).toBe('admin')
  })
})
