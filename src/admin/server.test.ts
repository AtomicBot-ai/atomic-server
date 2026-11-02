import { afterEach, expect, it } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { createLogger } from '../output/index.js'
import type { LogEntry } from '../output/index.js'
import { SessionStore } from './auth.js'
import { RelayHub } from './relay.js'
import { AdminServer } from './server.js'

const servers: AdminServer[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close()
})

async function start(port: number, name: string, lines: LogEntry[], host = '127.0.0.1') {
  const server = await AdminServer.start({
    host,
    port,
    link: fakeCoreLink(),
    relay: new RelayHub(),
    sessions: new SessionStore(),
    adminToken: async () => 'test-token',
    status: async () => ({ name }) as never,
    config: async () => ({}) as never,
    log: createLogger((entry) => lines.push(entry), { level: 'debug' }),
  })
  servers.push(server)
  return server
}

it('uses an OS-assigned port when requested without a fallback warning', async () => {
  const lines: LogEntry[] = []
  const server = await start(0, 'first', lines)
  expect(server.port).toBeGreaterThan(0)
  expect(server.url).toBe(`http://127.0.0.1:${server.port}`)
  expect(lines.filter((entry) => entry.level === 'warn')).toEqual([])
})

it('moves the admin to a free loopback port without disturbing the original listener or auth', async () => {
  const lines: LogEntry[] = []
  const original = await start(0, 'original', [])
  const moved = await start(original.port, 'moved', lines)
  expect(moved.host).toBe('127.0.0.1')
  expect(moved.port).toBeGreaterThan(0)
  expect(moved.port).not.toBe(original.port)
  expect((await fetch(`${moved.url}/api/status`)).status).toBe(401)
  for (const [server, name] of [
    [original, 'original'],
    [moved, 'moved'],
  ] as const) {
    const status = await fetch(`${server.url}/api/status`, {
      headers: { authorization: 'Bearer test-token' },
    })
    expect(status.status).toBe(200)
    expect(await status.json()).toEqual({ name })
  }
  expect(lines.find((entry) => entry.level === 'warn')?.message).toContain(String(original.port))
  expect(lines.find((entry) => entry.level === 'warn')?.message).toContain(moved.url)
})

it('still refuses a non-loopback admin instead of falling back', async () => {
  const lines: LogEntry[] = []
  await expect(start(0, 'refused', lines, '0.0.0.0')).rejects.toMatchObject({
    code: 'ATC_ADMIN_BIND_FAILED',
  })
  expect(lines).toEqual([])
})
