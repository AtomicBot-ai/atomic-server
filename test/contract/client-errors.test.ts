import { AtomicCore } from '@atomic-chat/core'
import { expect, it, vi } from 'vitest'
import { resolveConfig } from '../../src/config/index.js'
import { startDaemon } from '../../src/daemon/index.js'
import { recordingIo } from '../../src/io.js'
import { createLogger } from '../../src/output/index.js'
import { readAdminToken } from '../../src/admin/index.js'
import { createAtcReporter } from '../../src/telemetry/index.js'
import { fakeHost } from '../helpers/test-context.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

it('authenticates browser reports and checks the real core consent before external delivery', async () => {
  const tmp = tmpDataFolder('atc-client-report-contract-')
  const request = vi.fn<typeof fetch>(async () => new Response('{}'))
  const errors = await createAtcReporter({
    env: { ATC_SENTRY_DSN: 'https://test@o1.ingest.sentry.io/42' },
    consent: true,
    dataFolder: tmp.paths.dataFolder,
    telemetryFile: tmp.paths.layout.core.telemetry,
    homeDir: '/home/test',
    platform: 'linux',
    arch: 'x64',
    fetch: request,
    warn: () => {},
  })
  const daemon = await startDaemon({
    paths: tmp.paths,
    io: recordingIo(),
    host: fakeHost(),
    config: resolveConfig({ env: { ATC_API_AUTO_START: 'false', ATC_UPDATE_CHECK_ON_START: 'false' } }),
    log: createLogger(() => {}, { level: 'silent' }),
    controlPort: 0,
    admin: { enabled: true, port: 0 },
    telemetry: false,
    errors,
    createCore: (options) =>
      AtomicCore.create({ ...options, fetch: async () => new Response('{}', { status: 503 }) }),
  })
  try {
    const token = await readAdminToken(tmp.paths.adminToken)
    const post = (authenticated: boolean) =>
      fetch(`${daemon.admin!.url}/api/client-errors`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-atc-admin': '1',
          ...(authenticated ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          kind: 'react',
          name: 'TypeError',
          frames: ['    at render (/assets/index-Abc12.js:1:2)'],
        }),
      })
    expect((await post(false)).status).toBe(401)
    expect((await post(true)).status).toBe(202)
    await errors.flush()
    expect(request).not.toHaveBeenCalled()
    await daemon.link.request('PUT', '/telemetry', { enabled: true })
    expect((await post(true)).status).toBe(202)
    await errors.flush()
    expect(request).toHaveBeenCalledTimes(1)
    expect(String(request.mock.calls[0]?.[1]?.body)).toContain('"component":"web-admin"')
  } finally {
    await daemon.shutdown()
    tmp.cleanup()
  }
})
