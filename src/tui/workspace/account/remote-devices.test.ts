import { describe, expect, it } from 'vitest'
import type { WorkspaceAccount, WorkspaceSnapshot } from '../../../contract/index.js'
import type { Canvas } from '../draw/canvas.js'
import { workspaceFrame } from '../frame.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import { REMOTE_TITLE, deviceRows } from './remote-devices.js'

const request = {
  grant_id: 'r1',
  device_name: 'Work MacBook',
  platform: 'macos',
  client_type: 'desktop',
  check_code: '123456',
  created_at: '',
}
const device = { grant_id: 'd1', device_name: 'Home PC', platform: 'windows', since: Date.UTC(2026, 10, 10) }
const account = (over: Partial<WorkspaceAccount> = {}, remote = {}): WorkspaceAccount => ({
  enabled: true,
  signed_in: true,
  user: { email: 'ann@example.com', display_name: null },
  sign_in: { state: 'idle' },
  remote: {
    sharing: true,
    host_name: 'studio',
    tunnel: 'online',
    lan: true,
    addresses: 2,
    pairing: null,
    requests: [request],
    devices: [device],
    ended: [],
    error: null,
    ...remote,
  },
  ...over,
})
const state = (a?: WorkspaceAccount, patch: Partial<WorkspaceState> = {}): WorkspaceState => ({
  ...createWorkspace('account'),
  setupComplete: true,
  accountView: 'remote',
  focus: 'account-section:remote',
  remote: { state: 'online', canStop: true, url: 'https://x.trycloudflare.com' },
  workspace: {
    api: {
      running: true,
      host: '127.0.0.1',
      port: 1337,
      prefix: '/v1',
      endpoint: 'http://127.0.0.1:1337/v1',
    },
    keys: [],
    setups: [],
    downloads: [],
    ...(a ? { account: a } : {}),
  } as unknown as WorkspaceSnapshot,
  ...patch,
})
const screen = (c: Canvas) => c.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
const ids = (c: Canvas) => c.targets.map((t) => t.id)

describe('Account → Remote models', () => {
  it.each([
    [90, 32],
    [110, 32],
    [120, 40],
    [160, 50],
    [80, 24],
  ])('shares, adds a device, and lists who asks and who has access at %ix%i', (width, height) => {
    const c = workspaceFrame(state(account()), width, height, 0)
    const text = screen(c)
    expect(text).toContain(REMOTE_TITLE)
    expect(text).toContain('Shared with your devices over the internet and local network')
    expect(text).toContain('Stop sharing  [s]')
    expect(text).toContain('Add a device  [a]')
    expect(text).toContain('check code 123 456')
    expect(text).toContain('Home PC · Windows · since 2026-11-10')
    expect(text.indexOf('Asking for access')).toBeLessThan(text.indexOf('Devices with access'))
    expect(ids(c)).toEqual(
      expect.arrayContaining([
        'account-share',
        'account-pair',
        'account-allow:r1',
        'account-deny:r1',
        'account-revoke:d1',
      ])
    )
    // Nothing of Server → Remote access here.
    expect(ids(c)).not.toContain('remote-toggle')
    for (const t of c.targets) {
      expect(t.x + t.width).toBeLessThanOrEqual(width)
      expect(t.y + t.height).toBeLessThanOrEqual(t.y === height - 1 ? height : height - 3)
    }
  })

  it('says how many more there are when the list does not fit', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...device,
      grant_id: `d${i}`,
      device_name: `PC ${i}`,
    }))
    const c = workspaceFrame(state(account({}, { devices: many })), 80, 24, 0)
    expect(screen(c)).toMatch(/… \d+ more/)
    expect(ids(c)).toContain('account-share')
  })

  it('says stopping ends every device’s access', () => {
    const share = workspaceFrame(state(account()), 120, 40, 0).targets.find((t) => t.id === 'account-share')
    expect(share?.hint).toBe('Stop sharing; every device loses access and must pair again')
  })

  it('offers to share before adding a device', () => {
    const c = workspaceFrame(state(account({}, { sharing: false, requests: [], devices: [] })), 120, 40, 0)
    expect(screen(c)).toContain('Share with my devices  [s]')
    expect(screen(c)).toContain('Turn on sharing, then add a device.')
    expect(ids(c)).not.toContain('account-pair')
  })

  it('shows why sharing does not work', () => {
    const c = workspaceFrame(state(account({}, { error: 'the tunnel is down' })), 120, 40, 0)
    expect(screen(c)).toContain('Sharing is on, but the tunnel is down')
  })

  it('offers both ways to sign in while nobody is signed in', () => {
    const c = workspaceFrame(state(account({ signed_in: false, user: null })), 110, 32, 0)
    expect(screen(c)).toContain('Sign in to share this server’s models with your devices.')
    expect(ids(c)).toEqual(expect.arrayContaining(['account-email', 'account-device']))
    expect(ids(c)).not.toContain('account-share')
    expect(screen(c)).not.toContain('Settings → Account')
  })

  it('keeps the sidebar on Remote models, under the Account title', () => {
    const c = workspaceFrame(state(account()), 120, 40, 0)
    expect(screen(c)).toContain('Account')
    expect(ids(c)).toEqual(expect.arrayContaining(['account-section:overview', 'account-section:remote']))
  })
})

describe('the status line', () => {
  it('shows a device asking for access before a newer atc', () => {
    const s = state(account(), { page: 'server', serverView: 'remote' })
    const atc = { version: '0.2.0', update: { version: '0.3.0', command: 'atc update', url: '' } }
    const workspace = { ...s.workspace!, atc } as WorkspaceSnapshot
    expect(screen(workspaceFrame({ ...s, workspace }, 100, 30, 0))).toContain(
      'Work MacBook asks for access to this server — check code 123456'
    )
    const quiet = { ...workspace, account: account({}, { requests: [] }) }
    expect(screen(workspaceFrame({ ...s, workspace: quiet }, 100, 30, 0))).toContain('atc 0.3.0 is out')
  })

  it('keeps what just happened first', () => {
    const c = workspaceFrame(state(account(), { message: 'Status refreshed.' }), 100, 30, 0)
    expect(screen(c)).toContain('Status refreshed.')
    expect(screen(c)).not.toContain('asks for access')
  })
})

it('lists who asks before who has access', () => {
  expect(deviceRows(account()).map((row) => row.kind)).toEqual(['heading', 'request', 'heading', 'device'])
  expect(deviceRows(account({}, { requests: [], devices: [] }))).toEqual([
    { kind: 'note', text: 'No devices yet: press a to add one.' },
  ])
})
