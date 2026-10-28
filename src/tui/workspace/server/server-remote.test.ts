import { describe, expect, it, vi } from 'vitest'
import { canvas } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import type { ActionContext } from '../actions.js'
import { drawServerRemote } from './server-remote.js'
import { remoteAction } from './remote-actions.js'

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
})
