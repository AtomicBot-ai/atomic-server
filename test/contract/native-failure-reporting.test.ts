/** Native diagnostics survive the real fatal handler and Sentry envelope, without exception content. */
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { processHandlersFor } from '@atomic-chat/core/host'
import { expect, it } from 'vitest'
import { createAtcReporter, LazyErrorReporter } from '../../src/telemetry/index.js'
import { reportCollector } from '../helpers/report-collector.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

it('flushes a scrubbed, diagnosed fatal report before exiting with code 1', async () => {
  const collector = await reportCollector()
  const temp = tmpDataFolder()
  try {
    const reporter = new LazyErrorReporter(async () =>
      createAtcReporter({
        env: { ATC_SENTRY_DSN: collector.dsn, ATC_SENTRY_ENVIRONMENT: 'test' },
        consent: true,
        dataFolder: temp.paths.dataFolder,
        telemetryFile: join(temp.paths.dataFolder, 'telemetry.json'),
        homeDir: temp.paths.dataFolder,
        platform: 'win32',
        arch: 'x64',
        fetch,
        warn: () => {},
      })
    )
    const target = new EventEmitter()
    const exited = new Promise<number>((resolve) => {
      processHandlersFor(target, () => {}, resolve)({ reporter })
    })
    const error = new TypeError('failed to initialize Segments', {
      cause: new Error('private-prompt-value'),
    })
    error.stack = 'TypeError: failed to initialize Segments\n    at segment (unknown)'
    target.emit('uncaughtException', error)
    expect(await exited).toBe(1)
    expect(collector.events).toHaveLength(1)
    const envelope = collector.events[0]!
    expect(envelope).not.toContain('private-prompt-value')
    expect(envelope).not.toContain('failed to initialize Segments')
    expect(JSON.parse(envelope.split('\n')[2]!)).toMatchObject({
      level: 'fatal',
      tags: { component: 'process', native_failure: 'JSC_INTL_SEGMENTS_INIT_FAILED' },
      exception: {
        values: [
          {
            type: 'TypeError',
            value: 'Unexpected failure in uncaught_exception',
            mechanism: { type: 'uncaught_exception', handled: false },
          },
        ],
      },
    })
  } finally {
    await collector.close()
    temp.cleanup()
  }
})
