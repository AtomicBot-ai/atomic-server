/** Browser session and terminal client address one real daemon, without engines or external requests. */
import { AtomicCore } from '@atomic-chat/core'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { readAdminToken } from '../../src/admin/index.js'
import { resolveConfig } from '../../src/config/index.js'
import type { WorkspaceSnapshot } from '../../src/contract/index.js'
import { startDaemon } from '../../src/daemon/index.js'
import type { RunningDaemon } from '../../src/daemon/index.js'
import { recordingIo } from '../../src/io.js'
import { createLogger } from '../../src/output/index.js'
import { createWorkspaceClient } from '../../src/workspace-service/index.js'
import type { WorkspaceClient } from '../../src/workspace-service/index.js'
import { fakeHost } from '../helpers/test-context.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

const tmp = tmpDataFolder('atc-shared-workspace-')
let daemon: RunningDaemon
let web: WorkspaceClient
let terminal: WorkspaceClient
beforeAll(async () => {
  const config = resolveConfig({ env: {}, fileText: JSON.stringify({ api: { port: 0 } }) })
  daemon = await startDaemon({
    paths: tmp.paths,
    config,
    io: recordingIo(),
    host: fakeHost(),
    log: createLogger(() => {}, { level: 'silent' }),
    controlPort: 0,
    admin: { enabled: true, host: '127.0.0.1', port: 0 },
    telemetry: false,
    createCore: (options) =>
      AtomicCore.create({
        ...options,
        foundryLocalHost: {
          arch: process.platform === 'darwin' ? 'arm64' : 'x64',
          osRelease: '22.0.0',
          glibcVersion: '2.35',
        },
        fetch: async () => new Response('Offline fixture', { status: 503 }),
      }),
  })
  const url = daemon.admin!.url
  const login = await fetch(`${url}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-atc-admin': '1' },
    body: JSON.stringify({ token: await readAdminToken(tmp.paths.adminToken) }),
  })
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!
  const call = async (path: string, body?: unknown) => {
    const response = await fetch(`${url}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { cookie, 'content-type': 'application/json', 'x-atc-admin': '1' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const value = await response.json()
    expect(response.status, JSON.stringify(value)).toBe(200)
    return value
  }
  web = {
    snapshot: async () => (await call('/api/workspace')) as WorkspaceSnapshot,
    execute: (operation, input = {}) => call('/api/workspace/execute', { operation, input }),
  }
  terminal = await createWorkspaceClient({ link: daemon.link, paths: tmp.paths, config: config.values })
}, 60000)
beforeEach(async () => {
  await rm(join(tmp.paths.atcDir, 'workspace-setup.json'), { force: true })
  await daemon.link.server.stop()
  await terminal.execute('cloud.remove', { provider: 'readiness-fixture' })
})
afterAll(async () => {
  await daemon?.shutdown()
  tmp.cleanup()
})

it.each(['web', 'terminal'] as const)(
  'shares setup completion and API lifecycle when changed through %s',
  async (actor) => {
    const writer = actor === 'web' ? web : terminal,
      reader = actor === 'web' ? terminal : web
    expect((await reader.snapshot()).setup).toBeNull()
    await writer.execute('setup.manual')
    expect((await reader.snapshot()).setup).toMatchObject({ complete: true, mode: 'manual' })
    await writer.execute('cloud.save', {
      provider: 'readiness-fixture',
      base_url: 'https://provider.example/v1',
      models: ['ready-model'],
    })
    expect((await reader.snapshot()).services).toContainEqual(
      expect.objectContaining({ model: 'ready-model', state: 'ready', details: { cloud: true } })
    )
    await writer.execute('api.start', { request: { host: '127.0.0.1', port: 0 } })
    const [a, b] = await Promise.all([writer.snapshot(), reader.snapshot()])
    expect(a.core.instance_id).toBe(b.core.instance_id)
    expect(b.api.running).toBe(true)
    expect(b.api.endpoint).toBe(a.api.endpoint)
    expect(b.api.port).toBeGreaterThan(0)
    await writer.execute('api.stop')
    expect((await reader.snapshot()).api.running).toBe(false)
  }
)

it('refuses inference without a ready model while the shared management server stays available', async () => {
  await expect(terminal.execute('api.start')).rejects.toThrow('Choose and download a model')
  const snapshot = await web.snapshot()
  expect(snapshot.api.running).toBe(false)
  expect(snapshot.core.instance_id).toBeTruthy()
})

it('shares configuration, credentials and key lists through the same workspace', async () => {
  await terminal.execute('config.update', { values: { 'api.prefix': '/shared' } })
  expect(await web.execute('config.get')).toMatchObject({ values: { api: { prefix: '/shared' } } })
  await web.execute('cloud.save', {
    provider: 'test-shared',
    base_url: 'https://provider.example/v1',
    models: ['test-model'],
    api_key: 'test-shared-secret',
  })
  expect(await terminal.execute('cloud.list')).toMatchObject({
    providers: [expect.objectContaining({ provider: 'test-shared', has_api_key: true })],
  })
  await terminal.execute('cloud.remove', { provider: 'test-shared' })
  expect(await web.execute('cloud.list')).toEqual({ providers: [] })
  await web.execute('keys.create', { name: 'Shared client' })
  expect((await terminal.snapshot()).keys).toContainEqual(expect.objectContaining({ name: 'Shared client' }))
})
