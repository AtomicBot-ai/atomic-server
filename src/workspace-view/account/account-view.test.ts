import { describe, expect, it } from 'vitest'
import type { WorkspaceAccount, WorkspaceRemoteHost } from '../../contract/index.js'
import {
  accountLine,
  countdown,
  deviceLabel,
  endedNotice,
  formatCheckCode,
  platformLabel,
  requestNotice,
  sharingLine,
} from './account-view.js'

const remote = (patch: Partial<WorkspaceRemoteHost> = {}): WorkspaceRemoteHost => ({
  sharing: true,
  host_name: 'lab',
  tunnel: 'online',
  lan: false,
  addresses: 1,
  pairing: null,
  requests: [],
  ended: [],
  devices: [],
  error: null,
  ...patch,
})

const account = (patch: Partial<WorkspaceAccount> = {}): WorkspaceAccount => ({
  enabled: true,
  signed_in: true,
  user: { email: 'ann@example.com', display_name: null },
  sign_in: { state: 'idle' },
  remote: remote(),
  ...patch,
})

describe('account view', () => {
  it.each([
    ['atc-linux', 'Linux'],
    ['macos', 'macOS'],
    ['ios', 'iOS'],
    ['plan9', 'plan9'],
    [null, ''],
  ])('labels platform %j as %j', (platform, label) => {
    expect(platformLabel(platform)).toBe(label)
  })

  it('names a device by its name, then its platform', () => {
    expect(deviceLabel({ device_name: "Ann's iPhone", platform: 'ios' })).toBe("Ann's iPhone")
    expect(deviceLabel({ device_name: null, platform: 'ios' })).toBe('iOS')
    expect(deviceLabel({ device_name: null, platform: null })).toBe('A device')
  })

  it('says who is signed in', () => {
    expect(accountLine(undefined)).toBe('Accounts are off on this server')
    expect(accountLine(account())).toBe('Signed in as ann@example.com')
    expect(accountLine(account({ user: { email: 'a@b.c', display_name: 'Ann' } }))).toBe('Signed in as Ann')
    expect(accountLine(account({ user: null, signed_in: false }))).toBe('Not signed in')
  })

  it.each([
    [remote({ sharing: false }), 'Not shared with your devices'],
    [remote(), 'Shared with your devices over the internet'],
    [remote({ lan: true, addresses: 2 }), 'Shared with your devices over the internet and local network'],
    [remote({ tunnel: 'off', lan: true }), 'Shared with your devices over the local network'],
    [remote({ addresses: 0, tunnel: 'off' }), 'Sharing is on; waiting for the tunnel'],
    [
      remote({ addresses: 0, tunnel: 'error' }),
      'Sharing is on, but the tunnel failed and the API does not listen on the network',
    ],
    [
      remote({ error: 'cannot reach the account service' }),
      'Sharing is on, but cannot reach the account service',
    ],
  ])('describes sharing %#', (state, line) => {
    expect(sharingLine(state)).toBe(line)
  })

  it('announces the newest request with its check code', () => {
    expect(requestNotice(account())).toBeNull()
    const request = {
      grant_id: 'g',
      device_name: 'MacBook',
      platform: 'macos',
      client_type: 'desktop',
      check_code: '936468',
      created_at: '2026-11-12T10:00:00Z',
    }
    expect(requestNotice(account({ remote: remote({ requests: [request] }) }))).toBe(
      'MacBook asks for access to this server — check code 936468'
    )
  })

  it('says which device disconnected, by name or platform', () => {
    expect(endedNotice({ grant_id: 'g', device_name: 'Work MacBook', platform: 'macos', at: 1 })).toBe(
      'Work MacBook disconnected from this server'
    )
    expect(endedNotice({ grant_id: 'g', device_name: null, platform: 'ios', at: 1 })).toBe(
      'iOS disconnected from this server'
    )
  })

  it('formats check codes and countdowns', () => {
    expect(formatCheckCode('936468')).toBe('936 468')
    expect(countdown(1_000 + 598_000, 1_000)).toBe('9:58')
    expect(countdown(0, 5_000)).toBe('0:00')
  })
})
