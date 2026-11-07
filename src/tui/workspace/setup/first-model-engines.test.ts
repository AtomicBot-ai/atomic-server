import { expect, it, vi } from 'vitest'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import { firstRunAction } from './first-run.js'
import { firstModelChoices, selectedFirstModel } from './first-model.js'
import { newSetup } from '../../../terminal-setup/index.js'

it('keeps catalog recommendation metadata beyond the first three FLM rows', () => {
  const state = createWorkspace('setup')
  state.setup = {
    ...newSetup('server'),
    engine: 'fastflowlm',
    stage: 'models',
    path: {
      engine: 'fastflowlm',
      kind: 'fastflowlm',
      plan: null,
      job: null,
      rows: Array.from({ length: 5 }, (_, i) => ({
        id: String(i),
        title: String(i),
        detail: '',
        recommended: i < 4,
      })),
    },
  }
  expect(firstModelChoices(state).map((row) => row.group)).toEqual([
    'Recommended',
    'Recommended',
    'Recommended',
    'Recommended',
    'More models',
  ])
})

it.each(['fastflowlm', 'foundry-local', 'litert-lm', 'geniex', 'vllm', 'sglang', 'tensorrt-llm'])(
  'opens %s models from a persisted build selection without falling back to GGUF',
  async (engine) => {
    let state = { ...createWorkspace('setup'), engine: `${engine}|v1|native`, firstRun: 'model' as const }
    const installed = [
      { id: 'foreign', name: 'Wrong engine model', provider: 'llamacpp-upstream' },
      { id: 'local', name: 'Selected engine model', provider: engine },
    ]
    const execute = vi.fn(async (name: string) =>
      name === 'models.search'
        ? {
            models: [
              {
                model_id: 'native-model',
                name: 'Native model',
                default_variant: 'native',
                variants: [{ id: 'native' }],
              },
              {
                model_id: 'installed-family',
                name: 'Installed family',
                default_variant: 'local',
                variants: [{ id: 'local' }],
              },
            ],
          }
        : name === 'models.catalog'
          ? { models: [{ repository: 'native-model', note: 'Native model', vram_tier_bytes: 0 }] }
          : {}
    )
    const hub = vi.fn(async () => [{ id: 'wrong-gguf', downloads: 0 }])
    const ctx: ActionContext = {
      get: () => state,
      update: (fn) => {
        state = fn(state) as typeof state
      },
      controller: {
        installed: async () => installed,
        initializeKeys: async () => {},
        hub,
        setup: {
          readPath: async () => null,
          catalogs: async () => [],
          engines: async () => [engine],
          installed: async () => [engine],
        },
        runtime: { execute },
      } as unknown as WorkspaceController,
      send: vi.fn(),
      cancel: vi.fn(),
      copy: vi.fn(),
    }
    await firstRunAction('first-model', ctx)
    expect(state.setup).toMatchObject({ engine, stage: 'models', path: { engine } })
    expect(hub).not.toHaveBeenCalled()
    state.firstModelChoice = 'catalog:installed-family'
    if (!['vllm', 'sglang', 'tensorrt-llm'].includes(engine)) {
      state.installed.unshift({ id: 'older', name: 'Older model', provider: engine })
      expect(selectedFirstModel(state)?.key).toBe('local:local')
      state.installed.shift()
    }
    expect(firstModelChoices(state).map((row) => row.key)).toEqual(['local:local', 'catalog:native-model'])
    expect(execute).toHaveBeenCalledWith(
      ['vllm', 'sglang', 'tensorrt-llm'].includes(engine) ? 'models.catalog' : 'models.search',
      ['vllm', 'sglang', 'tensorrt-llm'].includes(engine) ? { engine } : { engine, query: '' }
    )
  }
)
