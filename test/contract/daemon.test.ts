/** Real core, isolated folder, no engine processes: daemon lifecycle, admin and public API contracts. */
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { AtomicCore, CORE_VERSION } from '@atomic-chat/core'
import { inspectLock } from '@atomic-chat/core/host'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { attachCore, readDaemonRecord } from '../../src/core-link/index.js'
import { resolveConfig } from '../../src/config/index.js'
import { startDaemon } from '../../src/daemon/index.js'
import type { RunningDaemon } from '../../src/daemon/index.js'
import { recordingIo } from '../../src/io.js'
import { createLogger } from '../../src/output/index.js'
import { readAdminToken } from '../../src/admin/index.js'
import type { AdminStatus } from '../../src/contract/index.js'
import { fakeHost } from '../helpers/test-context.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

const { paths, cleanup } = tmpDataFolder('atc-contract-')
const log = createLogger(() => {}, { level: 'silent' })
const nativeArch = process.platform === 'darwin' ? 'arm64' : 'x64'
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
    createCore: (options) => {
      coreOptions = options
      return AtomicCore.create({
        ...options,
        // Supported native-host facts on each CI OS; no release manifest leaves this process.
        foundryLocalHost: { arch: nativeArch, osRelease: '22.0.0', glibcVersion: '2.35' },
        fetch: async () => new Response('Offline contract fixture', { status: 503 }),
      })
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
      expect(lock.record).toMatchObject({
        owner_scope: 'cli',
        state: 'ready',
        pid: process.pid,
        version: CORE_VERSION,
      })
    expect(daemon.core.version).toBe(CORE_VERSION)
    expect(await daemon.link.health()).toMatchObject({ version: CORE_VERSION })
    if (process.platform !== 'win32')
      expect(statSync(paths.layout.core.controlToken).mode & 0o777).toBe(0o600)
    const record = await readDaemonRecord(paths.daemonRecord)
    expect(record).toMatchObject({
      instance_id: daemon.core.instanceId,
      admin_url: adminUrl,
      pid: process.pid,
      state: 'ready',
      core_version: CORE_VERSION,
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
    const body = (await status.json()) as AdminStatus
    expect(body.core).toMatchObject({ instance_id: daemon.core.instanceId, version: CORE_VERSION })
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

  it('keeps LiteRT-LM visible through the shared engine list when release sources are offline', async () => {
    const token = (await readAdminToken(paths.adminToken)) as string
    const response = await post(
      '/api/workspace/execute',
      { operation: 'engines.list', input: {} },
      { authorization: `Bearer ${token}` }
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { engines: Array<{ engine: string }> }
    expect(body.engines).toContainEqual(
      expect.objectContaining({
        engine: 'litert-lm',
        kind: 'engine-build',
        active: null,
        builds: [],
        error: expect.objectContaining({ code: expect.any(String), message: expect.any(String) }),
      })
    )
  })

  it('saves cloud credentials through authenticated operations and never returns the key in provider lists', async () => {
    const token = (await readAdminToken(paths.adminToken)) as string
    const call = (operation: string, input = {}) =>
      post('/api/workspace/execute', { operation, input }, { authorization: `Bearer ${token}` })
    const saved = await call('cloud.save', {
      provider: 'fixture',
      base_url: 'https://provider.example/v1',
      models: ['fixture-model'],
      api_key: 'contract-only-secret',
    })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ provider: 'fixture', has_api_key: true })
    const listed = await call('cloud.list')
    const body = await listed.text()
    expect(body).toContain('fixture-model')
    expect(body).not.toContain('contract-only-secret')
    expect((await call('cloud.remove', { provider: 'fixture' })).status).toBe(200)
    expect(await (await call('cloud.list')).json()).toEqual({ providers: [] })
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

  // ADR 2026-10-21-foundry-local-1ds-off-on-linux: on Linux the core and every process it starts get it.
  it('hands the core TF_BUILD=True on Linux only, so Foundry Local sends no 1DS telemetry there', () => {
    expect(coreOptions?.env?.['TF_BUILD']).toBe(process.platform === 'linux' ? 'True' : undefined)
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
    const chat = (model: string, messages: unknown[]) =>
      fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'authorization': `Bearer ${keys.keys[0]!.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages }),
      })
    const cold = await chat('missing-model', [{ role: 'user', content: 'Hello' }])
    expect(cold.status).toBe(503)
    expect(await cold.text()).toContain('No models are available')
    // Only session metadata is registered: validation must finish before contacting an engine.
    daemon.core.externalSessions.publish('contract-validation', 1, [
      {
        provider: 'llamacpp-upstream',
        model_id: 'registered-model',
        port: 1,
      },
    ])
    try {
      for (const row of [
        {
          model: 'missing-model',
          messages: [{ role: 'user', content: 'Hello' }],
          status: 404,
          code: 'model_not_found',
          param: 'model',
          message: /missing-model/,
        },
        {
          model: 'registered-model',
          messages: [],
          status: 400,
          code: 'empty_array',
          param: 'messages',
          message: /minimum length 1/,
        },
      ]) {
        const response = await chat(row.model, row.messages)
        expect(response.status).toBe(row.status)
        expect(response.headers.get('content-type')).toContain('application/json')
        expect(await response.json()).toMatchObject({
          error: {
            type: 'invalid_request_error',
            code: row.code,
            param: row.param,
            message: expect.stringMatching(row.message),
          },
        })
      }
    } finally {
      daemon.core.externalSessions.unregister('contract-validation')
      await daemon.link.server.stop()
    }
  })

  it('shuts down cleanly: lock released, record removed', async () => {
    await daemon.shutdown()
    expect((await inspectLock(paths.layout)).kind).not.toBe('owned')
    expect(await readDaemonRecord(paths.daemonRecord)).toBeUndefined()
  })
})
