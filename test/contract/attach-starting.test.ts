/**
 * A server whose core holds the lock but has not published its control port yet is starting, not
 * absent: `atc stop`, `restart` and `update` (which attach without launching) must not read it as
 * "not running" and go on as if the folder were free.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { CORE_VERSION } from '@atomic-chat/core'
import { afterAll, describe, expect, it } from 'vitest'
import { attachCore } from '../../src/core-link/index.js'
import { createLogger } from '../../src/output/index.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

const { paths, cleanup } = tmpDataFolder('atc-attach-starting-')
afterAll(() => cleanup())

describe('attaching to a starting server', () => {
  it('is not "not running": it waits, then says the server is still starting', async () => {
    const lock = paths.layout.core.instanceLock
    mkdirSync(dirname(lock), { recursive: true })
    // This process stands in for the owner: alive, identity unknown, so the core counts it as owned.
    writeFileSync(
      lock,
      JSON.stringify({
        instance_id: 'starting-instance',
        owner_scope: 'cli',
        pid: process.pid,
        process_start_id: null,
        protocol: 2,
        version: CORE_VERSION,
        data_folder: paths.dataFolder,
        control_host: '',
        control_port: 0,
        state: 'starting',
        acquired_at: new Date().toISOString(),
      })
    )
    await expect(
      attachCore({
        paths,
        launch: false,
        clientName: 'atc stop',
        pid: process.pid,
        log: createLogger(() => {}, { level: 'silent' }),
        spawnDaemon: async () => expect.fail('attaching without launch never spawns'),
        timeoutMs: 300,
      })
    ).rejects.toMatchObject({ code: 'ATC_DAEMON_START_FAILED', message: 'The server is still starting.' })
  })
})
