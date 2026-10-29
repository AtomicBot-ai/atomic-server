import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { tmpDataFolder } from '../test/helpers/tmp-data-folder.js'
import { fakeHost } from '../test/helpers/test-context.js'
import { AtcError } from './errors/index.js'
import { recordingIo } from './io.js'
import { runCli } from './main.js'

const tmp = tmpDataFolder('atc-command-reports-')
afterAll(() => tmp.cleanup())
afterEach(() => vi.restoreAllMocks())

describe('command error reporting', () => {
  it.each([
    [new TypeError('Synthetic command defect'), 1],
    [new AtcError('ATC_CHECKSUM_MISMATCH', 'Synthetic checksum mismatch'), 1],
  ])('reports an unexpected command failure before returning', async (error, count) => {
    const request = vi.fn<typeof fetch>(async () => new Response('{}'))
    const io = recordingIo({ env: { ATC_SENTRY_DSN: 'https://abc@o1.ingest.sentry.io/42' }, fetch: request })
    expect(
      await runCli([], io, {
        paths: tmp.paths,
        host: fakeHost(),
        root: {
          name: 'atc',
          summary: 'test',
          run: async () => {
            throw error
          },
        },
      })
    ).toBe(1)
    expect(request).toHaveBeenCalledTimes(count)
  })

  it('keeps expected refusals and opted-out runs off the network', async () => {
    const request = vi.fn<typeof fetch>(async () => new Response('{}'))
    for (const [error, env] of [
      [new AtcError('ATC_USAGE', 'bad argument'), {}],
      [new TypeError('defect'), { DO_NOT_TRACK: '1' }],
    ] as const) {
      await runCli(
        [],
        recordingIo({
          env: { ATC_SENTRY_DSN: 'https://abc@o1.ingest.sentry.io/42', ...env },
          fetch: request,
        }),
        {
          paths: tmp.paths,
          host: fakeHost(),
          root: {
            name: 'atc',
            summary: 'test',
            run: async () => {
              throw error
            },
          },
        }
      )
    }
    expect(request).not.toHaveBeenCalled()
  })
})
