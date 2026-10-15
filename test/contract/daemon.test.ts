/**
 * The daemon against a real core in a temporary data folder: the lock and token the core writes,
 * the run record atc adds, the admin BFF's auth and proxy, the SSE relay, and attach-or-spawn from
 * a command's point of view. No engine is started; the core's own tests cover model loads.
 */
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { AtomicCore } from '@atomic-chat/core'
import { inspectLock } from '@atomic-chat/core/host'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { attachCore, readDaemonRecord } from '../../src/core-link/index.js'
import { resolveConfig } from '../../src/config/index.js'
import { startDaemon } from '../../src/daemon/index.js'
import type { RunningDaemon } from '../../src/daemon/index.js'
import { recordingIo } from '../../src/io.js'
import { createLogger } from '../../src/output/index.js'
import { readAdminToken } from '../../src/admin/index.js'
import { fakeHost } from '../helpers/test-context.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

const { paths, cleanup } = tmpDataFolder('atc-contract-')
const log = createLogger(() => {}, { level: 'silent' })
let daemon: RunningDaemon
let adminUrl: string
let coreOptions: Parameters<typeof AtomicCore.create>[0]

beforeAll(async () => {
  daemon = await startDaemon({
    paths,
    io: recordingIo(),
    config: resolveConfig({ env: {} }),
    host: fakeHost(),
    log,
    controlPort: 0,
    admin: { enabled: true, host: '127.0.0.1', port: 0 },
    telemetry: false,
    probeHardware: false,
    createCore: (options) => {
      coreOptions = options
      return AtomicCore.create(options)
    },
  })
  adminUrl = daemon.admin!.url
}, 60_000)

afterAll(async () => {
  await daemon.shutdown().catch(() => undefined)
  cleanup()
})

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${adminUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-atc-admin': '1', ...headers },
    body: JSON.stringify(body),
  })

describe('the daemon owns the folder', () => {
  it('publishes the core lock, a private token and the atc run record', async () => {
    const lock = await inspectLock(paths.layout)
    expect(lock.kind).toBe('owned')
    if (lock.kind === 'owned')
      expect(lock.record).toMatchObject({ owner_scope: 'cli', state: 'ready', pid: process.pid })
    if (process.platform !== 'win32')
      expect(statSync(paths.layout.core.controlToken).mode & 0o777).toBe(0o600)
    const record = await readDaemonRecord(paths.daemonRecord)
    expect(record).toMatchObject({
      instance_id: daemon.core.instanceId,
      admin_url: adminUrl,
      pid: process.pid,
      state: 'ready',
    })
  })

  it('serves the embedded admin page and refuses the API without a session', async () => {
    const page = await fetch(`${adminUrl}/`)
    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toContain('text/html')
    expect(await page.text()).toMatch(/<html[ >]/i)
    const status = await fetch(`${adminUrl}/api/status`)
    expect(status.status).toBe(401)
    expect((await status.json()) as { error: { code: string } }).toMatchObject({
      error: { code: 'ATC_ADMIN_UNAUTHORIZED' },
    })
  })

  it('signs in with the token, then answers status, the proxy and the allowlist', async () => {
    const token = await readAdminToken(paths.adminToken)
    expect(token).toBeDefined()
    expect((await post('/api/session', { token: 'wrong' })).status).toBe(401)
    const login = await post('/api/session', { token })
    expect(login.status).toBe(204)
    const cookie = login.headers.get('set-cookie')?.split(';')[0]
    expect(cookie).toMatch(/^atc_session=/)
    const headers = { cookie: cookie as string }
    const status = await fetch(`${adminUrl}/api/status`, { headers })
    expect(status.status).toBe(200)
    const body = (await status.json()) as { core: { instance_id: string }; api: { running: boolean } }
    expect(body.core.instance_id).toBe(daemon.core.instanceId)
    expect(body.api.running).toBe(false)
    const snapshot = await fetch(`${adminUrl}/api/core/snapshot`, { headers })
    expect(snapshot.status).toBe(200)
    expect(((await snapshot.json()) as { instance_id: string }).instance_id).toBe(daemon.core.instanceId)
    expect((await fetch(`${adminUrl}/api/core/clients`, { headers })).status).toBe(403)
    expect((await fetch(`${adminUrl}/api/core/server/start`, { method: 'POST', headers })).status).toBe(403)
    const bearer = await fetch(`${adminUrl}/api/config`, { headers: { authorization: `Bearer ${token}` } })
    expect(bearer.status).toBe(200)
    expect(((await bearer.json()) as { values: { api: { port: number } } }).values.api.port).toBe(1337)
    expect((await fetch(`${adminUrl}/api/setup/state`, { headers })).status).toBe(501)
  })

  it('relays events over SSE', async () => {
    const token = (await readAdminToken(paths.adminToken)) as string
    const controller = new AbortController()
    const res = await fetch(`${adminUrl}/api/events`, {
      headers: { authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const reader = res.body!.getReader()
    const first = new TextDecoder().decode((await reader.read()).value)
    expect(first).toContain(': connected')
    daemon.relay.publish('atc:status', { hello: 1 })
    const second = new TextDecoder().decode((await reader.read()).value)
    expect(second).toContain('event: atc:status')
    controller.abort()
  })

  it('lets a command attach, hold a lease, and detects a foreign owner', async () => {
    const link = await attachCore({
      paths,
      launch: false,
      clientName: 'contract-test',
      pid: process.pid,
      log,
      spawnDaemon: async () => {},
    })
    expect(link.endpoint.instanceId).toBe(daemon.core.instanceId)
    const seen = await link.withLease('test', async (l) => (await l.snapshot()).clients.map((c) => c.name))
    expect(seen).toContain('contract-test')
    expect((await link.snapshot()).clients).toHaveLength(0)
    const record = await readDaemonRecord(paths.daemonRecord)
    await rm(paths.daemonRecord)
    await expect(
      attachCore({
        paths,
        launch: false,
        clientName: 't',
        pid: process.pid,
        log,
        spawnDaemon: async () => {},
      })
    ).rejects.toMatchObject({ code: 'ATC_DAEMON_FOREIGN' })
    const { writeDaemonRecord } = await import('../../src/core-link/index.js')
    await writeDaemonRecord(paths.daemonRecord, record!)
  })

  it('gives the core the keyring and a 20 s limit on remote GGUF reads, and no model download option', () => {
    expect(coreOptions).toMatchObject({ ownerScope: 'cli', remoteGgufTimeoutMs: 20_000 })
    expect(coreOptions).not.toHaveProperty('downloadStreams')
    expect(coreOptions?.publicApiKeys?.()).toEqual([expect.stringMatching(/^atc_[0-9a-f]{64}$/)])
  })

  it('never serves the public API without a key, even if nobody opened the terminal UI', async () => {
    // The server created the keyring when it started; the API started here passes no key itself.
    const keys = JSON.parse(readFileSync(join(paths.atcDir, 'client-keys.json'), 'utf8')) as {
      keys: Array<{ token: string }>
    }
    expect(keys.keys).toHaveLength(1)
    await daemon.link.server.start({
      host: '127.0.0.1',
      port: 0,
      prefix: '/v1',
      api_key: '',
      trusted_hosts: [],
      fallback_port: false,
    })
    const { port } = await daemon.link.server.status()
    const models = (headers: Record<string, string> = {}) =>
      fetch(`http://127.0.0.1:${port}/v1/models`, { headers }).then((r) => r.status)
    expect(await models()).toBe(401)
    expect(await models({ authorization: 'Bearer not-a-key' })).toBe(401)
    expect(await models({ authorization: `Bearer ${keys.keys[0]!.token}` })).toBe(200)
    await daemon.link.server.stop()
  })

  it('shuts down cleanly: lock released, record removed', async () => {
    await daemon.shutdown()
    expect((await inspectLock(paths.layout)).kind).not.toBe('owned')
    expect(await readDaemonRecord(paths.daemonRecord)).toBeUndefined()
  })
})
