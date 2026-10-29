import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { fakeHost } from '../../test/helpers/test-context.js'
import { resolveConfig } from '../config/index.js'
import { recordingIo } from '../io.js'
import { createLogger } from '../output/index.js'
import { runDaemon } from './run.js'
import { runCli } from '../main.js'
import { AtcErrorReporter, LazyErrorReporter } from '../telemetry/index.js'

const start = vi.hoisted(() => vi.fn())
vi.mock('./daemon.js', () => ({ startDaemon: start }))
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('server report shutdown', () => {
  it('keeps send failures visible in the server log with the shared process reporter', async () => {
    const tmp = tmpDataFolder('atc-report-warning-')
    const errors = new LazyErrorReporter(async (_consent, warn) => {
      warn('HTTP 429')
      return new AtcErrorReporter(undefined, true)
    })
    start.mockImplementation(async () => {
      errors.capture({ source: 'startup', level: 'fatal', error: new Error('fixture') })
      return {
        stopped: Promise.resolve(),
        core: { readyLine: () => ({}) },
        record: { admin_url: null },
      }
    })
    try {
      const io = recordingIo({ waitForShutdown: () => new Promise(() => {}) })
      expect(
        await runCli(['daemon'], io, { paths: tmp.paths, host: fakeHost(), errors }),
        io.err.join('')
      ).toBe(0)
      expect(await readFile(tmp.paths.daemonLog, 'utf8')).toContain('error report not sent: HTTP 429')
    } finally {
      tmp.cleanup()
    }
  })

  it.each(['signal', 'control'] as const)('flushes reports on %s shutdown', async (mode) => {
    const tmp = tmpDataFolder('atc-report-shutdown-')
    const stopped = deferred()
    const ready = deferred()
    const signalled = deferred()
    let stop = async () => {}
    const errors = { capture: vi.fn(), flush: vi.fn(async () => {}), follow: vi.fn() }
    start.mockImplementation(async () => {
      ready.resolve()
      return { stopped: stopped.promise, shutdown: async () => stopped.resolve() }
    })
    try {
      const running = runDaemon({
        paths: tmp.paths,
        config: resolveConfig({ env: {} }),
        host: fakeHost(),
        io: recordingIo({
          waitForShutdown: (onStop) => {
            stop = async () => {
              await onStop()
              signalled.resolve()
            }
            return signalled.promise
          },
        }),
        log: createLogger(() => {}, { level: 'silent' }),
        errors,
        controlPort: 0,
        admin: { enabled: false },
        printReadyLine: false,
      })
      await ready.promise
      if (mode === 'signal') await stop()
      else stopped.resolve()
      expect(await running).toBe(0)
      expect(errors.flush).toHaveBeenCalledWith(2000)
    } finally {
      tmp.cleanup()
    }
  })
})
