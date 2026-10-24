import { render } from 'ink'
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { fakeTerminal, eventually } from '../../../test/helpers/fake-terminal.js'
import { IntroScreen } from './IntroScreen.js'
import type { WorkspaceDeps } from './controller.js'
const execute = vi.hoisted(() => vi.fn())
vi.mock('./controller.js', () => ({
  WorkspaceController: class {
    engineSelection = { read: async () => '', list: async () => [] }
    setup = {
      read: async () => null,
      installed: async () => [],
      catalogs: async () => [
        {
          provider: 'llamacpp-upstream',
          recommended: 'b1/cpu',
          available: [{ version: 'b1', backend: 'cpu' }],
        },
      ],
    }
    runtime = { setup: async () => null, execute }
    dispose() {}
  },
}))
it('accepts a server-owned engine job, leaves the intro, and never cancels it on unmount', async () => {
  let accept!: () => void
  execute.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        accept = resolve
      })
  )
  const terminal = fakeTerminal(80, 24),
    next = vi.fn()
  const deps = { base: { loadConfig: async () => ({ values: { tui: { motion: false } } }) } } as WorkspaceDeps
  const ui = render(
    <IntroScreen deps={deps} color={false} write={terminal.stdout.write} onContinue={next} />,
    { ...terminal.streams, debug: true, interactive: true, exitOnCtrlC: false, patchConsole: false }
  )
  try {
    await eventually(() => terminal.stdout.lastFrame().includes('Choose engine'))
    await act(async () => terminal.stdin.press('\r'))
    await eventually(() => terminal.stdout.lastFrame().includes('llama.cpp'))
    await act(async () => terminal.stdin.press('\r'))
    expect(execute).toHaveBeenCalledWith('engines.enqueue', {
      engine: 'llamacpp-upstream',
      target: { version: 'b1', variant: 'cpu' },
      select: true,
    })
    expect(next).not.toHaveBeenCalled()
    await act(async () => accept())
    await eventually(() => next.mock.calls.length === 1)
  } finally {
    await act(async () => ui.unmount())
    await ui.waitUntilExit()
  }
  expect(execute.mock.calls).toHaveLength(1)
})
