import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceAccount } from '../../../contract/index.js'
import { canvas } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import type { ActionContext } from '../actions.js'
import { drawServerRemote } from './server-remote.js'
import { remoteAction } from './remote-actions.js'
import { workspaceFrame } from '../frame.js'

const missing = {
  state: 'error',
  error: 'cloudflared_unavailable',
  canStart: true,
  canStop: false,
  cloudflared: {
    found: null,
    commands: ['brew install cloudflared'],
    url: 'https://developers.cloudflare.com/x',
    restart: 'atc restart',
  },
}
const state = (remote: Record<string, unknown>) =>
  ({ ...createWorkspace('server'), serverView: 'remote', remote }) as unknown as WorkspaceState
const rows = (c: Canvas) => c.cells.map((row) => row.map((cell) => cell.char).join(''))
function draw(s: WorkspaceState, width = 70, height = 22) {
  const c = canvas(width, height)
  drawServerRemote(c, s, 0, 0, width, height - 1, '')
  return c
}

describe('the remote access screen while the server has no cloudflared', () => {
  it('says so and shows how to install it, then to restart, instead of a Start button', () => {
    const c = draw(state(missing))
    const text = rows(c).join('\n')
    expect(text).toContain('Cloudflare · cloudflared is not installed')
    expect(text).toContain('$ brew install cloudflared')
    expect(text).toContain('Then restart the server: atc restart')
    expect(text).toContain('Local network')
    expect(c.targets.map((t) => t.id)).toContain('remote-setup-copy')
    expect(c.targets.map((t) => t.id)).not.toContain('remote-toggle')
    expect(text).not.toContain('cloudflared_unavailable')
  })

  it('keeps Copy commands on a short screen', () => {
    const c = draw(state(missing), 60, 16)
    expect(c.targets.map((t) => t.id)).toContain('remote-setup-copy')
    expect(rows(c).join('\n')).toContain('Local network')
  })

  it('keeps Start when the program is there and would not start, and says so', () => {
    const blocked = { ...missing, cloudflared: { ...missing.cloudflared, found: '/usr/bin/cloudflared' } }
    const c = draw(state(blocked))
    const text = rows(c).join('\n')
    expect(text).toContain('Cloudflare · cloudflared could not start')
    expect(text).toContain('/usr/bin/cloudflared did not start')
    expect(text).not.toContain('atc restart')
    expect(c.targets.map((t) => t.id)).toContain('remote-toggle')
  })

  it('is the usual card for any other status', () => {
    const c = draw(state({ state: 'off', canStart: true, canStop: false }))
    expect(rows(c).join('\n')).toContain('Cloudflare · off')
    expect(c.targets.map((t) => t.id)).toContain('remote-toggle')
  })

  it('copies the commands and the restart', async () => {
    const copy = vi.fn()
    const ctx = { get: () => state(missing), copy } as unknown as ActionContext
    expect(await remoteAction('remote-setup-copy', ctx)).toBe(true)
    expect(copy).toHaveBeenCalledWith('brew install cloudflared\natc restart')
  })

  it('does not throw when starting remote access while the API is stopped', async () => {
    let current = state({ state: 'off', canStart: false, canStop: false, blockReason: 'server_stopped' })
    const execute = vi.fn()
    const ctx = {
      get: () => current,
      update: (fn: (v: WorkspaceState) => WorkspaceState) => {
        current = fn(current)
      },
      controller: { runtime: { execute } },
    } as unknown as ActionContext
    expect(await remoteAction('remote-toggle', ctx)).toBe(true)
    expect(execute).not.toHaveBeenCalled()
    expect(current).toMatchObject({
      busy: false,
      message: 'Start the API before remote access.',
    })
  })
})

describe('the remote access screen while accounts are on', () => {
  const account = (over: Partial<WorkspaceAccount> = {}): WorkspaceAccount => ({
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
      requests: [
        {
          grant_id: 'r1',
          device_name: 'Work MacBook',
          platform: 'macos',
          client_type: 'desktop',
          check_code: '123456',
          created_at: '',
        },
      ],
      devices: [{ grant_id: 'd1', device_name: 'Home PC', platform: 'windows', since: 1 }],
      error: null,
    },
    ...over,
  })
  const remote = (a?: WorkspaceAccount): WorkspaceState => ({
    ...state({ state: 'online', canStop: true, url: 'https://x.trycloudflare.com' }),
    setupComplete: true,
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
    } as never,
  })
  const text = (c: Canvas) => rows(c).join('\n')
  const ids = (c: Canvas) => c.targets.map((t) => t.id)

  // The sharing line, cut after a whole word where the row is short.
  it.each([
    [160, 50, /Shared with your devices over the internet and local network /],
    [120, 40, /Shared with your devices over the… /],
    [90, 32, /Shared with your devices… /],
    [80, 24, /Shared with your devices over… /],
    [60, 20, /Shared with… /],
  ])('keeps the cards as they were, with one row to Account → Remote models at %ix%i', (w, h, line) => {
    const on = workspaceFrame(remote(account()), w, h, 0)
    const off = workspaceFrame(remote(), w, h, 0)
    // The cards and their controls are where they are without accounts.
    for (const id of ['remote-toggle', 'lan-toggle', 'remote-refresh'])
      expect(on.targets.find((t) => t.id === id)).toEqual(off.targets.find((t) => t.id === id))
    expect(text(on)).not.toMatch(/Asking for access|Devices with access|Add a device/)
    expect(ids(on).filter((id) => id.startsWith('account-'))).toEqual(['account-section:remote'])
    const pointer = on.targets.find((t) => t.id === 'account-section:remote')!
    const refresh = on.targets.find((t) => t.id === 'remote-refresh')!
    expect(pointer.y).toBe(refresh.y)
    expect(pointer.x).toBeGreaterThan(refresh.x + refresh.width)
    expect(pointer.x + pointer.width).toBeLessThanOrEqual(w)
    expect(text(on)).toContain('Account → Remote models')
    expect(rows(on)[pointer.y]).toMatch(line)
  })

  it('says when the devices do not share this server', () => {
    const c = workspaceFrame(remote(account({ remote: { ...account().remote, sharing: false } })), 120, 40, 0)
    expect(text(c)).toContain('Not shared with your devices')
  })

  it('has no pointer while accounts are off', () => {
    for (const a of [undefined, account({ enabled: false })])
      expect(ids(workspaceFrame(remote(a), 120, 40, 0))).not.toContain('account-section:remote')
  })
})
