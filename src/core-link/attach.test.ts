import { afterEach, describe, expect, it } from 'vitest'
import { fakeOldOwner } from '../../test/helpers/fake-old-owner.js'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { createLogger } from '../output/index.js'
import { attachCore } from './attach.js'

describe('attachCore and a foreign core', () => {
  const cleanups: Array<() => unknown> = []
  afterEach(async () => {
    for (const c of cleanups.splice(0).reverse()) await c()
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
