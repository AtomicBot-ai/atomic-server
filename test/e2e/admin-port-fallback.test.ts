/** The installed binary recovers from an occupied web-admin port on a fresh data folder. */
import { createServer } from 'node:net'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { runAtc } from '../helpers/binary.js'

it('starts and opens its authenticated admin on the actual free port, preserving the preference', async () => {
  const occupied = createServer()
  await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve))
  const port = (occupied.address() as { port: number }).port
  const folder = mkdtempSync(join(tmpdir(), 'atc-e2e-admin-port-'))
  const atc = (...args: string[]) => runAtc([...args, '--data-folder', folder])
  try {
    expect(atc('config', 'set', 'admin.port', String(port)).code).toBe(0)
    const start = atc('start', '--json')
    expect(start.code, start.err).toBe(0)
    const started = JSON.parse(start.out) as { running: boolean; admin_url: string }
    const url = new URL(started.admin_url)
    expect(started.running).toBe(true)
    expect(url.hostname).toBe('127.0.0.1')
    expect(Number(url.port)).toBeGreaterThan(0)
    expect(Number(url.port)).not.toBe(port)
    expect(JSON.parse(atc('status', '--json').out)).toMatchObject({ admin_url: started.admin_url })
    const open = atc('admin', 'open', '--no-open', '--json')
    expect(open.code, open.err).toBe(0)
    const login = JSON.parse(open.out) as { url: string; admin_url: string }
    expect(login.admin_url).toBe(started.admin_url)
    expect(new URL(login.url).origin).toBe(started.admin_url)
    expect(new URL(login.url).hash).toMatch(/^#token=.+/)
    expect((await fetch(`${started.admin_url}/api/status`)).status).toBe(401)
    const token = new URLSearchParams(new URL(login.url).hash.slice(1)).get('token')
    const status = await fetch(`${started.admin_url}/api/status`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(status.status).toBe(200)
    expect(await status.json()).toMatchObject({ admin: { url: started.admin_url, port: Number(url.port) } })
    const config = JSON.parse(readFileSync(join(folder, 'atc', 'config.json'), 'utf8'))
    expect(config.admin.port).toBe(port)
    const log = readFileSync(join(folder, 'atc', 'logs', 'daemon.log'), 'utf8')
    expect(log).toContain(String(port))
    expect(log).toContain(started.admin_url)
    expect(occupied.listening).toBe(true)
  } finally {
    atc('stop', '--force', '--kill')
    await new Promise<void>((resolve) => occupied.close(() => resolve()))
    rmSync(folder, { recursive: true, force: true })
  }
})
