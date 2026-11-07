import { expect, it, vi } from 'vitest'
import { activate, type ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace, type WorkspaceState } from '../state.js'
import { canvas } from '../draw/canvas.js'
import { drawServerChoice } from './server-settings.js'

it.each([
  ['foundry-local', 'foundry'],
  ['fastflowlm', 'fastflowlm'],
  ['mlx', 'mlx'],
  ['sglang', 'safetensors'],
  ['llamacpp', 'gguf'],
] as const)('opens Download a model for the unsaved %s engine', async (provider, format) => {
  const engine = { id: `${provider}|v1|cpu`, provider, version: 'v1', backend: 'cpu', installed: true }
  let state: WorkspaceState = {
    ...createWorkspace('server'),
    setupComplete: true,
    engine: 'old-engine',
    libraryCategory: 'image',
    libraryFormat: 'gguf',
    libraryQuery: 'old query',
    libraryEngines: [provider],
    catalogFilters: { engine: 'old-engine', downloaded: true, liked: true, uncensored: true, sort: 'likes' },
  }
  const execute = vi.fn(async () => ({ models: [], rows: [] }))
  const write = vi.fn(async () => {})
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    send: vi.fn(),
    copy: vi.fn(),
    cancel: vi.fn(),
    controller: {
      runtime: { execute },
      setup: { catalogs: async () => [] },
      engineSelection: { list: async () => [engine] },
      installed: async () => [],
      catalogPreferences: { write },
    } as unknown as WorkspaceController,
  }
  await activate('server-engine', ctx)
  await activate('server-choice:0', ctx)
  await activate('server-model', ctx)
  const c = canvas(100, 35)
  drawServerChoice(c, state, '')
  expect(c.targets).toHaveLength(1)
  await activate(c.targets[0]!.id, ctx)
  expect(state).toMatchObject({
    page: 'models',
    overlay: null,
    serverChoice: null,
    engine: 'old-engine',
    serverDraft: { engine: engine.id, model: '' },
    libraryView: 'catalog',
    libraryCategory: 'text',
    libraryFormat: format,
    libraryQuery: '',
    catalogFilters: { engine: provider, downloaded: false, liked: false, uncensored: false },
  })
  expect(write).toHaveBeenCalledWith(
    expect.objectContaining({ libraryCategory: 'text', libraryFormat: format })
  )
  if (['foundry', 'fastflowlm'].includes(format))
    expect(execute).toHaveBeenCalledWith('models.search', { engine: provider })
  else if (format === 'safetensors')
    expect(execute).toHaveBeenCalledWith('models.catalog', { engine: provider })
  else expect(execute).toHaveBeenCalledWith('models.catalog', { category: 'text', query: '', refresh: false })
})
