import { describe, expect, it, vi } from 'vitest'
import { settingsSchema } from '@atomic-chat/core/settings'
import { environment, plan } from '../../../../test/helpers/managed-fixtures.js'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import { enginePanelModel } from './engine-panel-model.js'

const GPUS = [
  {
    gpu_id: 'GPU-a',
    name: 'RTX 4090',
    compute_capability: '8.9',
    total_vram_bytes: 24 * 1024 ** 3,
    free_vram_bytes: null,
    driver_version: null,
  },
  {
    gpu_id: 'GPU-b',
    name: 'RTX 3060',
    compute_capability: '8.6',
    total_vram_bytes: 12 * 1024 ** 3,
    free_vram_bytes: null,
    driver_version: null,
  },
]

/** A TUI on Library → Engines with `engine` listed, its settings at `values` (revision 4). */
function tui(engine: string, values: Record<string, unknown> = {}) {
  let s = { ...createWorkspace('models'), setupComplete: true }
  s.libraryView = 'engines'
  s.libraryRows = [{ id: engine, name: engine, category: 'engines', description: 'b1 · cpu' }]
  const execute = vi.fn(async (name: string, input: Record<string, unknown> = {}) => {
    if (name === 'engines.plan')
      return { engine, plan: plan(engine), installation: null, operation: null, notices: [] }
    if (name === 'settings.schema')
      return { provider: input['provider'], descriptors: settingsSchema(engine as never) }
    if (name === 'settings.get') return { revision: 4, values }
    if (name === 'environments.list') return [environment({ gpus: GPUS as never })]
    return { revision: 5, values: {} }
  })
  const ctx: ActionContext = {
    get: () => s,
    update: (fn) => {
      s = fn(s)
    },
    controller: {
      runtime: { execute, snapshot: async () => null, start: async () => ({ launch: 'terminal' }) },
    } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  return { ctx, execute, get: () => s }
}
const fields = (t: ReturnType<typeof tui>) => enginePanelModel(t.get().enginePanel!, null).fields ?? []
const field = (t: ReturnType<typeof tui>, key: string) =>
  fields(t).find((f) => f.id === `engine-setting:${key}`)

describe('the engine settings form', () => {
  it('opens for any provider with every field but the engine build', async () => {
    const t = tui('llamacpp')
    await activate('library-row:0', t.ctx)
    expect(t.execute.mock.calls.some(([n]) => n === 'engines.plan')).toBe(false)
    await activate('engine-settings', t.ctx)
    const keys = fields(t).map((f) => f.id)
    expect(keys).toContain('engine-setting:concurrent_mode')
    expect(keys).not.toContain('engine-setting:version_backend')
  })

  it('picks gpu_id among the environment’s cards, by name, compute capability and memory', async () => {
    const t = tui('vllm')
    await activate('library-row:0', t.ctx)
    await activate('engine-settings', t.ctx)
    expect(field(t, 'gpu_id')?.label).toContain('Card with the most free memory')
    await activate('engine-setting:gpu_id', t.ctx)
    await activate('engine-option:1', t.ctx)
    expect(field(t, 'gpu_id')?.label).toContain('RTX 4090 (CC 8.9, 24.0 GiB)')
    await activate('engine-setting:gpu_id', t.ctx)
    await activate('engine-option:2', t.ctx)
    expect(field(t, 'gpu_id')?.label).toContain('RTX 3060')
  })

  it('refuses a number outside its bounds and keeps the draft', async () => {
    const t = tui('sglang')
    await activate('library-row:0', t.ctx)
    await activate('engine-settings', t.ctx)
    await activate('engine-setting:mem_fraction_static', t.ctx)
    expect(t.get()).toMatchObject({ overlay: 'engine-panel', edit: 'engine-setting:mem_fraction_static' })
    t.ctx.update((v) => ({ ...v, editValue: '1.5' }))
    await activate('save-edit', t.ctx)
    expect(t.get().overlay).toBe('engine-panel')
    expect(t.get().enginePanel?.error).toMatch(/between 0 and 0\.99/)
    expect(t.get().enginePanel?.form?.draft).toEqual({})
  })

  it('saves only what changed, with the revision read when the form opened, and says when it applies', async () => {
    const t = tui('tensorrt-llm', { context_length: 8192, cuda_graphs: 'auto' })
    await activate('library-row:0', t.ctx)
    await activate('engine-settings', t.ctx)
    await activate('engine-setting:context_length', t.ctx)
    t.ctx.update((v) => ({ ...v, editValue: '16384' }))
    await activate('save-edit', t.ctx)
    await activate('engine-setting:cuda_graphs', t.ctx)
    await activate('engine-option:1', t.ctx)
    await activate('engine-settings-save', t.ctx)
    const update = t.execute.mock.calls.find(([n]) => n === 'settings.update')?.[1]
    expect(update).toEqual({
      provider: 'tensorrt-llm',
      values: { context_length: 16384, cuda_graphs: 'on' },
      expected_revision: 4,
    })
    expect(t.get().enginePanel?.notice).toMatch(/next model load/i)
  })
})

describe('gpu_id without cards', () => {
  it('is never typed: without the environment’s cards it stays the card with the most free memory', async () => {
    const t = tui('vllm')
    t.execute.mockImplementation((async (name: string, input: Record<string, unknown> = {}) => {
      if (name === 'settings.schema')
        return { provider: input['provider'], descriptors: settingsSchema('vllm' as never) }
      if (name === 'settings.get') return { revision: 4, values: {} }
      if (name === 'environments.list') return [environment({ gpus: [] })]
      if (name === 'engines.plan')
        return { engine: 'vllm', plan: plan('vllm'), installation: null, operation: null, notices: [] }
      return {}
    }) as never)
    await activate('library-row:0', t.ctx)
    await activate('engine-settings', t.ctx)
    await activate('engine-setting:gpu_id', t.ctx)
    expect(t.get().overlay).toBe('engine-panel')
    expect(field(t, 'gpu_id')?.label).toContain('Card with the most free memory')
  })
})

it('loads all settings on opening the engine and keeps number editing in the same popup', async () => {
  const t = tui('sglang', { context_length: 2048 })
  await activate('library-row:0', t.ctx)
  expect(t.get().enginePanel?.form).not.toBeNull()
  expect(fields(t).some((item) => item.id === 'engine-setting:context_length')).toBe(true)
  await activate('engine-setting:context_length', t.ctx)
  expect(t.get().overlay).toBe('engine-panel')
  t.ctx.update((v) => ({ ...v, editValue: '4096' }))
  await activate('engine-settings-save', t.ctx)
  expect(t.execute).toHaveBeenCalledWith('settings.update', {
    provider: 'sglang',
    values: { context_length: 4096 },
    expected_revision: 4,
  })
  await activate('engine-refresh', t.ctx)
  expect(t.execute).toHaveBeenCalledWith('engines.list', { force: true })
  expect(t.get().page).toBe('models')
})

it('hides Save after restoring an implicit checkbox default and sends no unchanged update', async () => {
  const t = tui('llamacpp-upstream')
  await activate('engine-open:llamacpp-upstream', t.ctx)
  const buttons = () => enginePanelModel(t.get().enginePanel!, null).buttons.map((b) => b.id)
  expect(field(t, 'mtp')?.label).toContain('off')
  expect(buttons()).not.toContain('engine-settings-save')
  await activate('engine-setting:mtp', t.ctx)
  expect(buttons()).toContain('engine-settings-save')
  await activate('engine-setting:mtp', t.ctx)
  expect(buttons()).not.toContain('engine-settings-save')
  expect(field(t, 'mtp')?.label).not.toContain('*')
  await activate('engine-settings-save', t.ctx)
  expect(t.execute.mock.calls.some(([name]) => name === 'settings.update')).toBe(false)
})
