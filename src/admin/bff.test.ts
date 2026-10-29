import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { createLogger } from '../output/index.js'
import { SessionStore } from './auth.js'
import { createBffHandler, proxyAllowed } from './bff.js'
import { RelayHub } from './relay.js'

describe('proxyAllowed', () => {
  it.each([
    ['GET', '/snapshot', true],
    ['GET', '/sessions', true],
    ['GET', '/backends/llamacpp-upstream', true],
    ['GET', '/clients', false],
    ['GET', '/cloud/providers', false],
    ['POST', '/models/llamacpp-upstream/x/load', true],
    ['POST', '/server/start', true],
    ['POST', '/shutdown', false],
    ['PUT', '/telemetry', false],
    // The core probes the machine; a page cannot replace its facts, only clear an override.
    ['PUT', '/hardware/override', false],
    ['DELETE', '/hardware/override', true],
    ['DELETE', '/clients/1', false],
    // The core has no GET under /disk; free space is POST /disk/available, allowed exactly.
    ['GET', '/disk/anything', false],
    ['POST', '/environments/default/operations', true],
    // Exact routes: a longer or shorter path under an allowed one is not allowed.
    ['POST', '/server/startX', false],
    ['POST', '/server/start/x', false],
    ['POST', '/environmentsX', false],
    ['POST', '/disk/availableX', false],
    ['POST', '/models/llamacpp-upstream/org/repo/model.gguf/load', true],
    ['POST', '/models/llamacpp-upstream/x/load/cancel', true],
    ['POST', '/models/llamacpp-upstream/load', false],
    ['POST', '/models/llamacpp-upstream/x/recreate', false],
    ['POST', '/downloads/llamacpp-backend-b1/macos-arm64/cancel', true],
    ['DELETE', '/backends/llamacpp/b1/macos-arm64', true],
    ['DELETE', '/backends/llamacpp', false],
    ['PATCH', '/settings/llamacpp', true],
    ['POST', '/settings/llamacpp/import', false],
    ['POST', '/settings/llamacpp/acknowledge', false],
    ['POST', '/environments/operations/op1/host-step-result', false],
    ['POST', '/environments/operations/op1/resume', true],
    // Model setups are atc's own workspace operations; the core has no such routes any more.
    ['POST', '/models/setup-plan', false],
    ['POST', '/model-setups', false],
    ['GET', '/model-setups', false],
    ['POST', '/models/compatibility', true],
  ])('%s %s → %s', (method, path, expected) => {
    expect(proxyAllowed(method, path)).toBe(expected)
  })
})

const servers: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of servers.splice(0).reverse()) await close()
})

async function adminServer(token: { value: string }): Promise<string> {
  const handler = createBffHandler({
    link: fakeCoreLink(),
    relay: new RelayHub(),
    sessions: new SessionStore(),
    adminToken: async () => token.value,
    status: async () => ({ ok: true }) as never,
    config: async () => ({}) as never,
    log: createLogger(() => undefined, { level: 'error' }),
    loopbackOnly: true,
  })
  const server = createServer((req, res) => {
    void handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  servers.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  )
  return `http://127.0.0.1:${listenPort(server)}`
}

const mutate = { 'x-atc-admin': '1', 'content-type': 'application/json' }

function sessionPair(response: Response): string {
  const raw = response.headers.get('set-cookie') ?? ''
  return raw.split(';')[0] ?? ''
}

function listenPort(server: Server): number {
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('admin test server has no port')
  return address.port
}

describe('admin sessions', () => {
  it('revokes the cookie on logout and when the admin token changes', async () => {
    const token = { value: 'admin-token' }
    const url = await adminServer(token)
    const login = await fetch(`${url}/api/session`, {
      method: 'POST',
      headers: mutate,
      body: JSON.stringify({ token: token.value }),
    })
    expect(login.status).toBe(204)
    const cookie = sessionPair(login)
    expect(cookie.startsWith('atc_session=')).toBe(true)
    expect((await fetch(`${url}/api/status`, { headers: { cookie } })).status).toBe(200)

    const logout = await fetch(`${url}/api/session`, { method: 'DELETE', headers: { ...mutate, cookie } })
    expect(logout.status).toBe(204)
    expect((await fetch(`${url}/api/status`, { headers: { cookie } })).status).toBe(401)

    const again = await fetch(`${url}/api/session`, {
      method: 'POST',
      headers: mutate,
      body: JSON.stringify({ token: token.value }),
    })
    const next = sessionPair(again)
    expect((await fetch(`${url}/api/status`, { headers: { cookie: next } })).status).toBe(200)
    token.value = 'rotated-token'
    expect((await fetch(`${url}/api/status`, { headers: { cookie: next } })).status).toBe(401)
  })
})
