import { expect, it, vi } from 'vitest'
import { newSetup } from '../../../terminal-setup/index.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceController } from '../controller.js'
import { engineSetupAction } from './engine-setup.js'
import { engineAction } from '../library/engine-actions.js'
import { firstRunAction } from './first-run.js'
import type { WorkspaceState } from '../state.js'

vi.mock('../library/engine-actions.js', () => ({ engineAction: vi.fn(async () => true) }))

it.each(['vllm', 'sglang', 'tensorrt-llm'])(
  'reviews uninstalled %s requirements after the intro choice before offering models',
  async (engine) => {
    let state = {
      ...createWorkspace('setup'),
      firstRun: 'model' as const,
      engine,
      setup: { ...newSetup('server'), engine },
    }
    const execute = vi.fn()
    vi.mocked(engineAction).mockClear()
    await engineSetupAction(`setup-engine:${engine}`, {
      get: () => state,
      update: (fn) => {
        state = fn(state) as typeof state
      },
      controller: { runtime: { execute } } as unknown as WorkspaceController,
    })
    expect(engineAction).toHaveBeenCalledWith(`engine-open:${engine}`, expect.anything())
    expect(execute).not.toHaveBeenCalled()
    expect(state.setup.path).toBeNull()
  }
)

it('keeps keyboard focus in the managed setup panel after first-run handoff', async () => {
  let state: WorkspaceState = { ...createWorkspace('welcome'), firstRun: 'model', engine: 'vllm' }
  vi.mocked(engineAction).mockImplementationOnce(async (_id, ctx) => {
    ctx.update((s) => ({
      ...s,
      overlay: 'engine-panel',
      focus: 'engine-setup',
      enginePanel: { engine: 'vllm', kind: 'managed' } as WorkspaceState['enginePanel'],
    }))
    return true
  })
  await firstRunAction('first-model', {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: {
      installed: async () => [],
      initializeKeys: async () => {},
      setup: {
        readPath: async () => null,
        catalogs: async () => [],
        engines: async () => ['vllm'],
        installed: async () => [],
      },
      runtime: { execute: vi.fn(async () => ({})) },
    } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  })
  expect(state.overlay).toBe('engine-panel')
  expect(state.enginePanel?.inSetup).toBe(true)
  expect(state.focus).toBe('engine-setup')
})
