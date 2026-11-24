import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { AtomicCore, CORE_VERSION } from '@atomic-chat/core'
import { CoreClient } from '@atomic-chat/core/client'
import { expect, it, vi } from 'vitest'
import { readAdminToken } from '../../src/admin/index.js'
import { resolveConfig } from '../../src/config/index.js'
import { startDaemon } from '../../src/daemon/index.js'
import type { RunningDaemon } from '../../src/daemon/index.js'
import { recordingIo } from '../../src/io.js'
import { createLogger } from '../../src/output/index.js'
import manifestFixture from '../fixtures/strata/manifest.json' with { type: 'json' }
import { catalogFixture } from '../helpers/model-catalog-fixture.js'
import { fakeHost } from '../helpers/test-context.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

it('uses the server’s local Strata manifest and model catalog without fetching conf', async () => {
  const { paths, cleanup } = tmpDataFolder('atc-strata-sources-')
  const offline = vi.fn<typeof fetch>(async () => new Response('Offline contract fixture', { status: 503 }))
  let daemon: RunningDaemon | undefined
  try {
    await mkdir(paths.dataFolder)
    const manifest = join(paths.dataFolder, 'local strata.json')
    const catalog = join(paths.dataFolder, 'local catalog.json')
    await writeFile(manifest, JSON.stringify(manifestFixture))
    await writeFile(
      catalog,
      JSON.stringify(
        catalogFixture({
          'staff-picks': { picks: [{ model_name: 'fixture/local-model', title: 'Local model' }] },
        })
      )
    )
    const env = {
      ATOMIC_STRATA_MANIFEST_URL: pathToFileURL(manifest).href,
      ATOMIC_MODEL_CATALOG_URL: pathToFileURL(catalog).href,
      ATC_API_AUTO_START: 'false',
      ATC_UPDATE_CHECK_ON_START: 'false',
    }
    daemon = await startDaemon({
      paths,
      io: recordingIo({ env, fetch: offline }),
      config: resolveConfig({ env }),
      host: fakeHost(),
      log: createLogger(() => {}, { level: 'silent' }),
      controlPort: 0,
      admin: { enabled: true, port: 0 },
      telemetry: false,
      createCore: (options) => AtomicCore.create({ ...options, fetch: offline }),
    })

    expect(daemon.core.version).toBe(CORE_VERSION)
    const client = new CoreClient({ baseUrl: daemon.link.endpoint.baseUrl, token: daemon.core.controlToken })
    await expect(client.strataPreparations()).resolves.toEqual([])
    await expect(daemon.link.request('POST', '/engine-builds/strata/catalog', {})).resolves.toMatchObject({
      engine: 'strata',
      manifest: { tag: 'strata-0.1.59-r7', source: 'remote' },
      manifest_error: null,
    })

    const token = await readAdminToken(paths.adminToken)
    const response = await fetch(new URL('/api/workspace/execute', daemon.admin!.url), {
      method: 'POST',
      headers: { 'authorization': 'Bearer ' + token, 'content-type': 'application/json', 'x-atc-admin': '1' },
      body: JSON.stringify({ operation: 'models.catalog', input: { category: 'text' } }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ rows: [{ id: 'fixture/local-model' }], cached: false })
    expect(offline.mock.calls.map(([url]) => String(url))).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/atomic-chat-conf.*(?:strata-manifest|models\/catalog)\.json/),
      ])
    )
  } finally {
    await daemon?.shutdown()
    cleanup()
  }
}, 30_000)
