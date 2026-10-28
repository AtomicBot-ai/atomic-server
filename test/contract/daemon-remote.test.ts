/**
 * Remote access on a server with no `cloudflared` (ADR 2026-10-28-the-server-finds-cloudflared): the
 * real core reports `cloudflared_unavailable`, and the server adds how to install one. The core's own
 * variable names a path that is not there, so no tunnel can start on a machine that has the program.
 */
import { AtomicCore } from '@atomic-chat/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readAdminToken } from '../../src/admin/index.js'
import { resolveConfig } from '../../src/config/index.js'
import type { WorkspaceRemoteAccess } from '../../src/contract/index.js'
import { startDaemon } from '../../src/daemon/index.js'
import type { RunningDaemon } from '../../src/daemon/index.js'
import { recordingIo } from '../../src/io.js'
import { createLogger } from '../../src/output/index.js'
import { fakeHost } from '../helpers/test-context.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

const { paths, cleanup } = tmpDataFolder('atc-remote-')
let daemon: RunningDaemon
let created: Parameters<typeof AtomicCore.create>[0]

beforeAll(async () => {
  daemon = await startDaemon({
    paths,
    io: recordingIo({ env: { PATH: '', ATOMIC_CLOUDFLARED_BIN: '/nonexistent/cloudflared' } }),
    config: resolveConfig({
      env: { ATC_API_AUTO_START: 'false', ATC_UPDATE_CHECK_ON_START: 'false' },
      fileText: JSON.stringify({ api: { port: 0 } }),
    }),
    host: fakeHost(),
    log: createLogger(() => {}, { level: 'silent' }),
    controlPort: 0,
    admin: { enabled: true, host: '127.0.0.1', port: 0 },
    telemetry: false,
    createCore: (options) => {
      created = options
      return AtomicCore.create({
        ...options,
        fetch: async () => new Response('Offline fixture', { status: 503 }),
      })
    },
  })
}, 60_000)

afterAll(async () => {
  await daemon.shutdown().catch(() => undefined)
  cleanup()
})

describe('remote access without cloudflared', () => {
  it('names no program to the core, and tells clients how to install one', async () => {
    expect(created).toBeDefined()
    expect(created!.cloudflaredPath).toBeUndefined()
    const token = (await readAdminToken(paths.adminToken)) as string
    const execute = async (operation: string, input: Record<string, unknown> = {}) => {
      const response = await fetch(`${daemon.admin!.url}/api/workspace/execute`, {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${token}`,
          'content-type': 'application/json',
          'x-atc-admin': '1',
        },
        body: JSON.stringify({ operation, input }),
      })
      expect(response.status).toBe(200)
      return (await response.json()) as WorkspaceRemoteAccess
    }
    await execute('api.start', { request: { host: '127.0.0.1', port: 0 } })
    await execute('remote.start', { request: {} })
    let status = await execute('remote.status')
    for (let i = 0; i < 50 && status.state !== 'error'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      status = await execute('remote.status')
    }
    expect(status).toMatchObject({ state: 'error', error: 'cloudflared_unavailable', canStart: true })
    expect(status.cloudflared).toMatchObject({ found: null, restart: 'atc restart' })
    expect(status.cloudflared!.url).toMatch(/^https:\/\//)
  })
})
