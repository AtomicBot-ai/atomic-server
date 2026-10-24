import { render } from 'ink'
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { fakeTerminal, eventually } from '../../../test/helpers/fake-terminal.js'
import { IntroScreen } from './IntroScreen.js'
import type { WorkspaceDeps } from './controller.js'

const state = vi.hoisted(() => ({ engine: '', installed: false }))
vi.mock('./controller.js', () => ({
  WorkspaceController: class {
    engineSelection = { read: async () => state.engine, list: async () => [] }
    setup = {
      read: async () => null,
      installed: async () => (state.installed ? [{}] : []),
      catalogs: async () => [
        {
          provider: 'llamacpp-upstream',
          recommended: 'b1/cpu',
          available: [{ version: 'b1', backend: 'cpu' }],
        },
      ],
    }
    runtime = { setup: async () => null }
    dispose() {}
  },
}))

it.each(['selected', 'installed'])(
  'waits for deliberate input with a %s engine and unfinished onboarding',
  async (kind) => {
    state.engine = kind === 'selected' ? 'llamacpp-upstream|b1|cpu' : ''
    state.installed = kind === 'installed'
    const terminal = fakeTerminal(80, 24)
    const next = vi.fn()
    const deps = {
      base: { loadConfig: async () => ({ values: { tui: { motion: false } } }) },
    } as WorkspaceDeps
    const ui = render(
      <IntroScreen deps={deps} color={false} write={terminal.stdout.write} onContinue={next} />,
      {
        ...terminal.streams,
        debug: true,
        interactive: true,
        exitOnCtrlC: false,
        patchConsole: false,
      }
    )
    try {
      await eventually(() => terminal.stdout.lastFrame().includes('Press any key'))
      expect(terminal.stdout.lastFrame()).toContain('(o)(o)')
      expect(next).not.toHaveBeenCalled()
      for (const report of [
        '\u001b[24;80R',
        '\u001b[I',
        '\u001b[O',
        '\u001b[?1;2c',
        '\u001b[13;1:2u',
        '\u001b[13;1:3u',
        '\u001b[<0;1;1M',
        '\u001b[<0;1;1m',
      ])
        await act(async () => {
          terminal.stdin.press(report)
        })

      expect(next).not.toHaveBeenCalled()
      if (kind === 'selected')
        await act(async () => {
          terminal.stdin.press('x')
        })
      else {
        const lines = terminal.stdout.lastFrame().split('\n')
        const row = lines.findIndex((line) => line.includes('Press any key'))
        const column = lines[row]!.indexOf('Press any key')
        await act(async () => {
          terminal.stdin.press(`\u001b[<0;${column + 1};${row + 1}M`)
        })
      }
      expect(next).toHaveBeenCalledOnce()
      await act(async () => {
        terminal.stdin.press('x')
      })
      expect(next).toHaveBeenCalledOnce()
    } finally {
      await act(async () => ui.unmount())
      await ui.waitUntilExit()
    }
  }
)

it('keeps a fresh hero visible until the user opens engine selection', async () => {
  state.engine = ''
  state.installed = false
  const terminal = fakeTerminal(80, 24)
  const next = vi.fn()
  const deps = {
    base: { loadConfig: async () => ({ values: { tui: { motion: false } } }) },
  } as WorkspaceDeps
  const ui = render(
    <IntroScreen deps={deps} color={false} write={terminal.stdout.write} onContinue={next} />,
    {
      ...terminal.streams,
      debug: true,
      interactive: true,
      exitOnCtrlC: false,
      patchConsole: false,
    }
  )
  try {
    await eventually(() => terminal.stdout.lastFrame().includes('Choose engine'))
    expect(terminal.stdout.lastFrame()).not.toContain('Choose your engine')
    await act(async () => {
      terminal.stdin.press('\u001b[24;80R')
    })
    expect(terminal.stdout.lastFrame()).not.toContain('Choose your engine')
    expect(next).not.toHaveBeenCalled()
    await act(async () => {
      terminal.stdin.press('\r')
    })
    await eventually(() => terminal.stdout.lastFrame().includes('Choose your engine'))
    expect(next).not.toHaveBeenCalled()
    await act(async () => terminal.stdin.press('\u001b'))
    await eventually(() => terminal.stdout.lastFrame().includes('Choose engine'))
    expect(terminal.stdout.lastFrame()).not.toContain('Choose your engine')
    expect(next).not.toHaveBeenCalled()
  } finally {
    await act(async () => ui.unmount())
    await ui.waitUntilExit()
  }
})

it('wakes its eyes once without advancing onboarding', async () => {
  state.engine = 'llamacpp-upstream|b1|cpu'
  state.installed = true
  const terminal = fakeTerminal(80, 24)
  const next = vi.fn()
  const deps = {
    base: { loadConfig: async () => ({ values: { tui: { motion: true } } }) },
  } as WorkspaceDeps
  const ui = render(
    <IntroScreen deps={deps} color={false} write={terminal.stdout.write} onContinue={next} />,
    { ...terminal.streams, debug: true, interactive: true, exitOnCtrlC: false, patchConsole: false }
  )
  try {
    await eventually(() => terminal.stdout.lastFrame().includes('(X)(X)'))
    await eventually(() => terminal.stdout.lastFrame().includes('(-)(-)'))
    await eventually(() => terminal.stdout.lastFrame().includes('(o)(o)'))
    expect(terminal.stdout.lastFrame()).toContain('Press any key')
    expect(next).not.toHaveBeenCalled()
    await act(async () => terminal.stdin.press('x'))
    expect(next).toHaveBeenCalledOnce()
  } finally {
    await act(async () => ui.unmount())
    await ui.waitUntilExit()
  }
})
