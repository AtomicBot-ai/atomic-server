/** The first engine screen keeps a server failure's details and hint through the real controller. */
import { createElement } from 'react'
import { render } from 'ink'
import { expect, it } from 'vitest'
import { resolveConfig } from '../../src/config/index.js'
import { AtcError } from '../../src/errors/index.js'
import { IntroScreen } from '../../src/tui/workspace/intro/IntroScreen.js'
import type { WorkspaceDeps } from '../../src/tui/workspace/controller.js'
import { fakeTerminal, eventually } from '../helpers/fake-terminal.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

it('shows the cause, allows retry, and preserves back and quit after a failed launch', async () => {
  const { paths, cleanup } = tmpDataFolder('atc-intro-error-')
  const terminal = fakeTerminal(80, 24)
  let attempts = 0
  const failure = new AtcError('ATC_DAEMON_START_FAILED', 'The server did not start.', {
    details: 'The admin cannot listen on 0.0.0.0 yet.',
    hint: 'keep 127.0.0.1',
  })
  const deps: WorkspaceDeps = {
    apiKey: '',
    chatKey: '',
    request: async () => {
      throw new Error('Unexpected network request')
    },
    base: {
      paths,
      attach: async () => {
        attempts++
        throw failure
      },
      loadConfig: async () => resolveConfig({ env: { ATC_TUI_MOTION: 'false' } }),
      runDoctor: async () => [],
      pendingHostSteps: async () => [],
      loginUrl: async () => '',
      openUrl: async () => {},
      now: () => new Date(),
    },
  }
  const ui = render(
    createElement(IntroScreen, {
      deps,
      color: false,
      write: terminal.stdout.write,
      onContinue: () => {},
    }),
    { ...terminal.streams, debug: true, interactive: true, exitOnCtrlC: false, patchConsole: false }
  )
  try {
    await eventually(() => terminal.stdout.lastFrame().includes('Choose engine'))
    terminal.stdin.press('\r')
    await eventually(() => terminal.stdout.lastFrame().includes('The server did not start.'))
    expect(terminal.stdout.lastFrame()).toContain(failure.details)
    expect(terminal.stdout.lastFrame()).toContain('Hint: keep 127.0.0.1')
    const beforeRetry = attempts
    terminal.stdin.press('\r')
    await eventually(() => attempts > beforeRetry && terminal.stdout.lastFrame().includes('Hint:'))
    terminal.stdin.press('\u001b')
    await eventually(() => terminal.stdout.lastFrame().includes('Choose engine'))
    terminal.stdin.press('\u0011')
    await ui.waitUntilExit()
  } finally {
    ui.unmount()
    await ui.waitUntilExit()
    cleanup()
  }
})
