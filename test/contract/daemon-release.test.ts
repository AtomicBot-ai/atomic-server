/**
 * The server's own look at atc releases (ADR 2026-10-28): what it knows is the workspace snapshot's
 * `atc`, read through the admin. The look is driven by hand here against a faked GitHub; the timer that
 * would run it is off (`ATC_UPDATE_CHECK_ON_START`), as in every test that starts a server.
 */
import { AtomicCore } from '@atomic-chat/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readAdminToken } from '../../src/admin/index.js'
import { resolveConfig } from '../../src/config/index.js'
import type { WorkspaceSnapshot } from '../../src/contract/index.js'
import { startDaemon } from '../../src/daemon/index.js'
import type { RunningDaemon } from '../../src/daemon/index.js'
import { recordingIo } from '../../src/io.js'
import { createLogger } from '../../src/output/index.js'
import { ATC_VERSION } from '../../src/version.js'
import { fakeHost } from '../helpers/test-context.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

const { paths, cleanup } = tmpDataFolder('atc-release-')
let daemon: RunningDaemon
const github: string[] = []

beforeAll(async () => {
  daemon = await startDaemon({
    paths,
    io: recordingIo({
      env: { ATC_GITHUB_API: 'http://github.test' },
      fetch: async (input) => {
        github.push(String(input))
        return new Response(
          JSON.stringify({ tag_name: 'v99.0.0', html_url: 'https://example.test/v99', assets: [] })
        )
      },
    }),
    config: resolveConfig({ env: { ATC_API_AUTO_START: 'false', ATC_UPDATE_CHECK_ON_START: 'false' } }),
    host: fakeHost(),
    log: createLogger(() => {}, { level: 'silent' }),
    controlPort: 0,
    admin: { enabled: true, host: '127.0.0.1', port: 0 },
    telemetry: false,
    createCore: (options) =>
      AtomicCore.create({
        ...options,
        fetch: async () => new Response('Offline contract fixture', { status: 503 }),
      }),
  })
}, 60_000)

afterAll(async () => {
  await daemon.shutdown().catch(() => undefined)
  cleanup()
})

describe('the server and atc releases', () => {
  it('tells clients about a newer atc once its own look ran, and nothing before', async () => {
    const token = (await readAdminToken(paths.adminToken)) as string
    const headers = { authorization: `Bearer ${token}` }
    const read = async () =>
      ((await (await fetch(`${daemon.admin!.url}/api/workspace`, { headers })).json()) as WorkspaceSnapshot)
        .atc
    expect(await read()).toEqual({ version: ATC_VERSION, checked_at: null, update: null })
    expect(github).toEqual([])
    await daemon.releases.check()
    expect(github).toEqual(['http://github.test/repos/AtomicBot-ai/atomic-server/releases/latest'])
    // Run from source: nothing installs a release here, so only the page is named.
    expect(await read()).toEqual({
      version: ATC_VERSION,
      checked_at: expect.any(Number),
      update: { version: '99.0.0', url: 'https://example.test/v99', command: null },
    })
  })
})
