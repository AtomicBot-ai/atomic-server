/** A busy admin port must not stop the core or first-run engine detection. */
import { createServer } from 'node:net'
import { AtomicCore } from '@atomic-chat/core'
import { expect, it } from 'vitest'
import { readAdminToken } from '../../src/admin/index.js'
import { resolveConfig } from '../../src/config/index.js'
import { describeDaemon, readDaemonRecord } from '../../src/core-link/index.js'
import { startDaemon } from '../../src/daemon/index.js'
import type { RunningDaemon } from '../../src/daemon/index.js'
import { recordingIo } from '../../src/io.js'
import { createLogger } from '../../src/output/index.js'
import { fakeHost } from '../helpers/test-context.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

it('publishes the real admin URL and keeps serving control requests when the preferred port is busy', async () => {
  const occupied = createServer()
  await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve))
  const port = (occupied.address() as { port: number }).port
  const { paths, cleanup } = tmpDataFolder('atc-admin-port-')
  const config = resolveConfig({
    env: {
      ATC_ADMIN_PORT: String(port),
      ATC_API_AUTO_START: 'false',
      ATC_UPDATE_CHECK_ON_START: 'false',
    },
  })
  let daemon: RunningDaemon | undefined
  try {
    daemon = await startDaemon({
      paths,
      io: recordingIo(),
      config,
      host: fakeHost(),
      log: createLogger(() => {}, { level: 'silent' }),
      controlPort: 0,
      admin: { enabled: true },
      telemetry: false,
      createCore: (options) =>
        AtomicCore.create({
          ...options,
          fetch: async () => new Response('Offline contract fixture', { status: 503 }),
        }),
    })
    const admin = daemon.admin!
    expect(admin.port).not.toBe(port)
    expect(admin.port).toBeGreaterThan(0)
    expect(config.values.admin.port).toBe(port)
    expect(await readDaemonRecord(paths.daemonRecord)).toMatchObject({
      state: 'ready',
      admin_url: admin.url,
    })
    expect(await describeDaemon(daemon.link, paths, () => new Date())).toMatchObject({
      running: true,
      admin_url: admin.url,
      state: 'ready',
    })
    const headers = { authorization: `Bearer ${await readAdminToken(paths.adminToken)}` }
    const status = await fetch(`${admin.url}/api/status`, { headers })
    expect(status.status).toBe(200)
    expect(await status.json()).toMatchObject({
      admin: { host: '127.0.0.1', port: admin.port, url: admin.url },
    })
    const engines = await daemon.link.request<{ engines: unknown[] }>('POST', '/engines/versions', {})
    expect(engines.engines.length).toBeGreaterThan(0)
    expect(occupied.listening).toBe(true)
  } finally {
    await daemon?.shutdown()
    await new Promise<void>((resolve) => occupied.close(() => resolve()))
    cleanup()
  }
})
