import { afterEach, describe, expect, it, vi } from 'vitest'
import { CORE_VERSION } from '@atomic-chat/core'
import { waitForPublishedOwner } from '@atomic-chat/core/host'
import type * as CoreHost from '@atomic-chat/core/host'
import { fakeOldOwner } from '../../test/helpers/fake-old-owner.js'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { createLogger } from '../output/index.js'
import { attachCore } from './attach.js'

vi.mock('@atomic-chat/core/host', async (importOriginal) => {
  const host = await importOriginal<typeof CoreHost>()
  return { ...host, waitForPublishedOwner: vi.fn(host.waitForPublishedOwner) }
})

describe('attachCore and a foreign core', () => {
  const cleanups: Array<() => unknown> = []
  afterEach(async () => {
    for (const c of cleanups.splice(0).reverse()) await c()
  })

  it('waits for a server whose permission checks finish after the old 20-second budget', async () => {
    const t = tmpDataFolder('atc-slow-permissions-')
    cleanups.push(t.cleanup)
    const host = await vi.importActual<typeof CoreHost>('@atomic-chat/core/host')
    let elapsed = 0
    vi.mocked(waitForPublishedOwner).mockImplementationOnce((layout, options) =>
      host.waitForPublishedOwner(layout, {
        ...options,
        now: () => elapsed,
        sleep: async () => {
          elapsed += 25_000
          if (elapsed === 50_000) {
            const owner = await fakeOldOwner(t.paths, { version: CORE_VERSION })
            cleanups.push(owner.close)
          }
        },
      })
    )
    const link = await attachCore({
      paths: t.paths,
      launch: true,
      clientName: 'atc start',
      pid: process.pid,
      log: createLogger(() => undefined, { level: 'error' }),
      spawnDaemon: async () => ({ pid: process.pid }),
    })
    expect(elapsed).toBe(50_000)
    expect(link.endpoint.version).toBe(CORE_VERSION)
  })

  it('rejects a protocol mismatch with no daemon.json and does not shut it down', async () => {
    const t = tmpDataFolder('atc-foreign-')
    cleanups.push(t.cleanup)
    const old = await fakeOldOwner(t.paths, { atcRecord: false })
    cleanups.push(old.close)
    const spawned: string[] = []
    await expect(
      attachCore({
        paths: t.paths,
        launch: true,
        clientName: 'atc start',
        pid: process.pid,
        log: createLogger(() => undefined, { level: 'error' }),
        spawnDaemon: async () => {
          spawned.push('spawn')
          return { pid: process.pid }
        },
      })
    ).rejects.toMatchObject({
      code: 'ATC_DAEMON_FOREIGN',
      message: 'The data folder is owned by a core that is not Atomic Server.',
      details: `pid ${process.pid}, core 0.0.1 — probably \`atomic-chat-core\`'s own CLI`,
      hint: 'stop it (`atomic-chat-core shutdown`) or use a separate --data-folder',
    })
    expect(old.shutdowns).toEqual([])
    expect(spawned).toEqual([])
  })
})
