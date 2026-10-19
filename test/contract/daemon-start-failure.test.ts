/**
 * A server that fails after its core started (an admin address it may not bind) gives the folder back:
 * the core shuts down and releases its lock, and no `daemon.json` says an atc server is coming. A
 * client attaching meanwhile would otherwise wait for a `ready` that never comes.
 */
import { existsSync } from 'node:fs'
import { AtomicCore } from '@atomic-chat/core'
import { inspectLock } from '@atomic-chat/core/host'
import { afterAll, describe, expect, it } from 'vitest'
import { resolveConfig } from '../../src/config/index.js'
import { startDaemon } from '../../src/daemon/index.js'
import { recordingIo } from '../../src/io.js'
import { createLogger } from '../../src/output/index.js'
import { fakeHost } from '../helpers/test-context.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

const { paths, cleanup } = tmpDataFolder('atc-start-failure-')
afterAll(() => cleanup())

describe('a server that fails while starting', () => {
  it('shuts its core down and leaves no record', async () => {
    await expect(
      startDaemon({
        paths,
        io: recordingIo(),
        config: resolveConfig({ env: {} }),
        host: fakeHost(),
        log: createLogger(() => {}, { level: 'silent' }),
        controlPort: 0,
        admin: { enabled: true, host: '0.0.0.0', port: 0 },
        telemetry: false,
        createCore: (options) => AtomicCore.create(options),
      })
    ).rejects.toThrow()
    expect((await inspectLock(paths.layout)).kind).not.toBe('owned')
    expect(existsSync(paths.daemonRecord)).toBe(false)
  }, 60_000)
})
