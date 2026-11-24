import { request } from 'node:http'
import { AtomicCore } from '@atomic-chat/core'
import { expect, it } from 'vitest'
import { resolveConfig } from '../../src/config/index.js'
import { startDaemon } from '../../src/daemon/index.js'
import type { RunningDaemon } from '../../src/daemon/index.js'
import { recordingIo } from '../../src/io.js'
import { createLogger } from '../../src/output/index.js'
import { fakeHost } from '../helpers/test-context.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

it('keeps headless Strata preparation on the control listener and protects the public API', async () => {
  const { paths, cleanup } = tmpDataFolder('atc-strata-headless-')
  const env = {
    ATC_API_KEY: 'strata-contract-key',
    ATC_API_AUTO_START: 'false',
    ATC_UPDATE_CHECK_ON_START: 'false',
  }
  let daemon: RunningDaemon | undefined
  try {
    daemon = await startDaemon({
      paths,
      io: recordingIo({ env }),
      config: resolveConfig({ env }),
      host: fakeHost(),
      log: createLogger(() => {}, { level: 'silent' }),
      controlPort: 0,
      admin: { enabled: false },
      telemetry: false,
      createCore: (options) =>
        AtomicCore.create({
          ...options,
          fetch: async () => new Response('Offline contract fixture', { status: 503 }),
        }),
    })
    const state = await daemon.link.server.start({
      host: '127.0.0.1',
      port: 0,
      prefix: '/v1',
      fallback_port: false,
    })
    const base = `http://127.0.0.1:${state.port}`
    const headers = { authorization: 'Bearer ' + env.ATC_API_KEY }
    expect((await fetch(base + '/v1/models')).status).toBe(401)
    const listed = await fetch(base + '/v1/models', { headers })
    expect(listed.status).toBe(200)
    expect(await listed.json()).toMatchObject({ data: [] })
    const untrusted = await new Promise<number | undefined>((resolve, reject) => {
      request(base + '/v1/models', { headers: { ...headers, host: 'untrusted.example' } }, (response) => {
        response.resume()
        resolve(response.statusCode)
      })
        .on('error', reject)
        .end()
    })
    expect(untrusted).toBe(403)
    expect((await fetch(base + '/atomic/v1/strata/preparations', { headers })).status).toBe(404)
    const metrics = await fetch(base + '/v1/metrics', { headers })
    expect(metrics.status).toBeGreaterThanOrEqual(400)
    await expect(daemon.link.request('GET', '/strata/preparations')).resolves.toEqual([])
  } finally {
    await daemon?.shutdown()
    cleanup()
  }
}, 30_000)
