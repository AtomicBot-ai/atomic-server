/**
 * A server whose core holds the lock but has not published its control port yet is starting, not
 * absent: `atc stop`, `restart` and `update` (which attach without launching) must not read it as
 * "not running" and go on as if the folder were free.
 */
import { spawn } from 'node:child_process'
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

describe('launching a server that dies at once', () => {
  // A daemon that exits while starting (an admin address it may not bind, a broken config) releases
  // the folder; the client that launched it says why as soon as it is gone, not after the timeout.
  it('reports the reason from its log without waiting out the start timeout', async () => {
    const { paths: fresh, cleanup: done } = tmpDataFolder('atc-attach-dead-')
    try {
      mkdirSync(dirname(fresh.daemonOutLog), { recursive: true })
      writeFileSync(fresh.daemonOutLog, 'error: The admin cannot listen on 0.0.0.0 yet.\n')
      const started = Date.now()
      await expect(
        attachCore({
          paths: fresh,
          launch: true,
          clientName: 'atc start',
          pid: process.pid,
          log: createLogger(() => {}, { level: 'silent' }),
          spawnDaemon: async () => {
            const child = spawn(process.execPath, ['-e', 'process.exit(1)'])
            await new Promise((r) => child.once('exit', r))
            return { pid: child.pid }
          },
          timeoutMs: 20_000,
        })
      ).rejects.toMatchObject({
        code: 'ATC_DAEMON_START_FAILED',
        details: expect.stringContaining('cannot listen on 0.0.0.0'),
      })
      expect(Date.now() - started).toBeLessThan(5_000)
    } finally {
      done()
    }
  }, 30_000)
})

describe('launching while another starter wins the folder', () => {
  // Two `atc start` at once: ours loses the lock and exits, the other server is starting. That is
  // not a failed start: the client keeps waiting for the owner that holds the folder.
  it('keeps waiting for the live owner instead of reporting its own daemon gone', async () => {
    const { paths: fresh, cleanup: done } = tmpDataFolder('atc-attach-race-')
    try {
      const started = Date.now()
      await expect(
        attachCore({
          paths: fresh,
          launch: true,
          clientName: 'atc start',
          pid: process.pid,
          log: createLogger(() => {}, { level: 'silent' }),
          spawnDaemon: async () => {
            // The other starter takes the folder just after ours was launched; ours then exits.
            mkdirSync(dirname(fresh.layout.core.instanceLock), { recursive: true })
            writeFileSync(
              fresh.layout.core.instanceLock,
              JSON.stringify({
                instance_id: 'winner',
                owner_scope: 'cli',
                pid: process.pid,
                process_start_id: null,
                protocol: 2,
                version: CORE_VERSION,
                data_folder: fresh.dataFolder,
                control_host: '',
                control_port: 0,
                state: 'starting',
                acquired_at: new Date().toISOString(),
              })
            )
            const child = spawn(process.execPath, ['-e', 'process.exit(1)'])
            await new Promise((r) => child.once('exit', r))
            return { pid: child.pid }
          },
          timeoutMs: 1_500,
        })
      ).rejects.toBeTruthy()
      // It waited for the winner (whose port never comes here) rather than giving up at once.
      expect(Date.now() - started).toBeGreaterThanOrEqual(1_400)
    } finally {
      done()
    }
  }, 30_000)
})
