/**
 * A browser signed in to the web admin stays signed in across `atc restart`: sessions live in the data
 * folder's run directory, not only in the daemon's memory (0.2.1 logged everyone out on every restart).
 */
import { AtomicCore } from '@atomic-chat/core'
import { afterAll, describe, expect, it } from 'vitest'
import { readAdminToken } from '../../src/admin/index.js'
import { resolveConfig } from '../../src/config/index.js'
import { startDaemon } from '../../src/daemon/index.js'
import type { RunningDaemon } from '../../src/daemon/index.js'
import { recordingIo } from '../../src/io.js'
import { createLogger } from '../../src/output/index.js'
import { fakeHost } from '../helpers/test-context.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

const { paths, cleanup } = tmpDataFolder('atc-session-restart-')
let daemon: RunningDaemon | undefined

async function start() {
  daemon = await startDaemon({
    paths,
    io: recordingIo(),
    config: resolveConfig({ env: { ATC_API_AUTO_START: 'false', ATC_UPDATE_CHECK_ON_START: 'false' } }),
    host: fakeHost(),
    log: createLogger(() => {}, { level: 'silent' }),
    controlPort: 0,
    admin: { enabled: true, host: '127.0.0.1', port: 0 },
    telemetry: false,
    createCore: (options) => AtomicCore.create(options),
  })
  return daemon.admin!.url
}

afterAll(async () => {
  await daemon?.shutdown().catch(() => undefined)
  cleanup()
})

describe('the web admin session', () => {
  it('survives a restart of the server', async () => {
    const first = await start()
    const token = (await readAdminToken(paths.adminToken)) as string
    const login = await fetch(`${first}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-atc-admin': '1' },
      body: JSON.stringify({ token }),
    })
    expect(login.status).toBe(204)
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!
    expect((await fetch(`${first}/api/status`, { headers: { cookie } })).status).toBe(200)
    await daemon!.shutdown()
    const second = await start()
    expect((await fetch(`${second}/api/status`, { headers: { cookie } })).status).toBe(200)
  }, 60_000)
})
