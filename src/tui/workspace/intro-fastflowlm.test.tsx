import { render } from 'ink'
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { fakeTerminal, eventually } from '../../../test/helpers/fake-terminal.js'
import { IntroScreen } from './intro/IntroScreen.js'
import type { WorkspaceDeps } from './controller.js'

const execute = vi.hoisted(() => vi.fn(async () => ({})))
const remember = vi.hoisted(() => vi.fn(async (_id: string) => {}))
const offered = vi.hoisted(() => ({ provider: 'fastflowlm' }))
vi.mock('./controller.js', () => ({
  WorkspaceController: class {
    engineSelection = {
      read: async () => '',
      remember,
      list: async () => [
        {
          id: offered.provider,
          provider: offered.provider,
          version: 'flm-1',
          backend: 'linux-x64-npu',
          installed: false,
        },
        { id: 'vllm', provider: 'vllm', version: 'v1', backend: 'linux/amd64', installed: false },
      ],
    }
    setup = { read: async () => null, installed: async () => [], catalogs: async () => [] }
    runtime = { setup: async () => null, execute }
    dispose() {}
  },
}))

it.each([
  ['fastflowlm', 'FastFlowLM'],
  ['mlx', 'MLX'],
  ['foundry-local', 'Foundry Local'],
  ['litert-lm', 'LiteRT-LM'],
  ['geniex', 'GenieX'],
  ['vllm', 'vLLM'],
  ['sglang', 'SGLang'],
  ['tensorrt-llm', 'TensorRT-LLM'],
])('offers uninstalled %s without a llama.cpp catalog', async (provider, name) => {
  offered.provider = provider
  execute.mockClear()
  remember.mockClear()
  const terminal = fakeTerminal(80, 24),
    next = vi.fn()
  const deps = { base: { loadConfig: async () => ({ values: { tui: { motion: false } } }) } } as WorkspaceDeps
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
    await act(async () => terminal.stdin.press('\r'))
    await eventually(() => terminal.stdout.lastFrame().includes(name))
    expect(terminal.stdout.lastFrame()).not.toContain('No compatible engines')
    await act(async () => terminal.stdin.press('\r'))
    await eventually(() => next.mock.calls.length === 1)
    if (['vllm', 'sglang', 'tensorrt-llm'].includes(provider)) {
      expect(remember).toHaveBeenCalledWith(provider)
      expect(execute).not.toHaveBeenCalled()
    } else
      expect(execute).toHaveBeenCalledWith('engines.enqueue', {
        engine: provider,
        target: { version: 'flm-1', variant: 'linux-x64-npu' },
        select: true,
      })
  } finally {
    await act(async () => ui.unmount())
    await ui.waitUntilExit()
  }
})
