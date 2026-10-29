import { afterEach, expect, it, vi } from 'vitest'
import { fakeTerminal } from '../../test/helpers/fake-terminal.js'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { fakeHost } from '../../test/helpers/test-context.js'
import { recordingIo } from '../io.js'
import { runCli } from '../main.js'
import { runTui } from './run-tui.js'
import type { TuiDeps } from './controller.js'

vi.mock('./workspace/index.js', () => ({
  WorkspaceApp: () => {
    throw new TypeError('private-render-content')
  },
}))
afterEach(() => vi.restoreAllMocks())

it('reports an actual Ink render failure once through the process owner', async () => {
  const tmp = tmpDataFolder('atc-tui-report-'),
    terminal = fakeTerminal()
  const request = vi.fn<typeof fetch>(async () => new Response('{}'))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const root = {
      name: 'atc',
      summary: 'test',
      subcommands: [
        {
          name: 'tui',
          summary: 'test',
          run: async () =>
            runTui({
              terminal: terminal.streams,
              deps: {} as TuiDeps,
              screen: undefined,
              color: false,
              dataFolder: tmp.paths.dataFolder,
              waitForShutdown: () => new Promise(() => {}),
              root: { name: 'atc', summary: 'test' },
            }),
        },
      ],
    }
    expect(
      await runCli(
        ['tui'],
        recordingIo({ fetch: request, env: { ATC_SENTRY_DSN: 'https://test@o1.ingest.sentry.io/42' } }),
        { root, paths: tmp.paths, host: fakeHost() }
      )
    ).toBe(1)
    expect(request).toHaveBeenCalledTimes(1)
    const body = String(request.mock.calls[0]?.[1]?.body)
    expect(body).toContain('"component":"tui"')
    expect(body).not.toContain('private-render-content')
  } finally {
    tmp.cleanup()
  }
})
