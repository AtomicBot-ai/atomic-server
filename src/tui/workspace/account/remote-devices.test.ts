import { describe, expect, it } from 'vitest'
import type { WorkspaceAccount, WorkspaceSnapshot } from '../../../contract/index.js'
import type { Canvas } from '../draw/canvas.js'
import { workspaceFrame } from '../frame.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import { DEVICES_TITLE, deviceRows } from './remote-devices.js'

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
    error: null,
    ...remote,
  },
  ...over,
})
const state = (a?: WorkspaceAccount, patch: Partial<WorkspaceState> = {}): WorkspaceState => ({
  ...createWorkspace('server'),
  setupComplete: true,
  serverView: 'remote',
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

describe('Server → Remote access with the account', () => {
  it.each([
    ['full cards on a tall screen', 120, 40, 'Copy URL'],
    ['two-line cards on a short one', 100, 30, 'Copy URL'],
    ['two-line cards on 80x24', 80, 24, 'Start access'],
  ])('shows the devices first, then %s', (_name, width, height, card) => {
    const c = workspaceFrame(state(account()), width, height, 0)
    const text = screen(c)
    expect(text).toContain(DEVICES_TITLE)
    expect(text).toContain('Shared with your devices over the internet and local network')
    expect(text).toContain('Add a device  [a]')
    expect(text).toContain('check code 123 456')
    expect(text).toContain('Public remote access')
    expect(text).toContain('Local network')
    expect(text).toContain(card)
    expect(text.indexOf(DEVICES_TITLE)).toBeLessThan(text.indexOf('Public remote access'))
    expect(ids(c)).toEqual(
      expect.arrayContaining([
        'account-share',
        'account-pair',
        'account-allow:r1',
        'account-deny:r1',
        'remote-toggle',
        'lan-toggle',
        'remote-refresh',
      ])
    )
    for (const t of c.targets)
      expect(t.y + t.height).toBeLessThanOrEqual(t.y === height - 1 ? height : height - 3)
  })

  it('lists devices with access and their Revoke on a tall screen', () => {
    const c = workspaceFrame(state(account()), 120, 40, 0)
    expect(screen(c)).toContain('Home PC · Windows · since 2026-11-10')
    expect(ids(c)).toContain('account-revoke:d1')
  })

  it('says how many more there are when the list does not fit', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      ...device,
      grant_id: `d${i}`,
      device_name: `PC ${i}`,
    }))
    const c = workspaceFrame(state(account({}, { devices: many })), 80, 24, 0)
    expect(screen(c)).toMatch(/… \d+ more/)
    expect(ids(c)).toContain('lan-toggle')
  })

  it('offers to share before adding a device', () => {
    const c = workspaceFrame(state(account({}, { sharing: false, requests: [], devices: [] })), 120, 40, 0)
    expect(screen(c)).toContain('Share with my devices  [s]')
    expect(screen(c)).toContain('Turn on sharing, then add a device.')
    expect(ids(c)).not.toContain('account-pair')
  })

  it('says to sign in when nobody is', () => {
    const c = workspaceFrame(state(account({ signed_in: false, user: null })), 100, 30, 0)
    expect(screen(c)).toContain('Sign in to share this server with your devices: Settings → Account')
    expect(ids(c)).toContain('settings-section:account')
    expect(ids(c)).not.toContain('account-share')
  })

  it.each([
    ['accounts off', account({ enabled: false })],
    ['no account (not a server)', undefined],
  ])('is the usual screen with %s', (_name, a) => {
    const c = workspaceFrame(state(a), 100, 30, 0)
    expect(screen(c)).not.toContain(DEVICES_TITLE)
    expect(screen(c)).not.toContain('asks for access')
    expect(ids(c).some((id) => id.startsWith('account-'))).toBe(false)
  })
})

describe('the status line', () => {
  it('shows a device asking for access before a newer atc', () => {
    const s = state(account())
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
