import { describe, expect, it, vi } from 'vitest'
import { createWorkspace } from '../state.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { loadVariantCatalog, variantCatalogAction, variantNext } from './catalog-variants.js'
const variant = (verdict = 'ok') => ({ id: 'model-cpu', size_bytes: 1000, verdict: { verdict } })
const ENGINES = [
  { format: 'foundry', engine: 'foundry-local', ops: 'foundry' },
  { format: 'litert', engine: 'litert-lm', ops: 'litert' },
] as const
function fixture(ops: string, verdict = 'ok', blockers: string[] = []) {
  let s = createWorkspace('models')
  const models = () => [
    {
      model_id: 'model',
      name: 'Model',
      summary: 'Small local model',
      variants: [variant(verdict)],
      default_variant: 'model-cpu',
    },
  ]
  const execute = vi.fn(async (name: string, _input?: unknown) => {
    if (name === 'models.search') return { models: models() }
    if (name === `${ops}.prepare`) {
      verdict = 'ok'
      return {}
    }
    if (name === `${ops}.plan`) return { digest: 'checked-plan', blockers }
    return {}
  })
  const ctx: ActionContext = {
    get: () => s,
    update: (fn) => {
      s = fn(s)
    },
    controller: { runtime: { execute, snapshot: async () => null } } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  return { ctx, execute, get: () => s }
}
describe.each(ENGINES)('$engine in Local models', ({ format, engine, ops }) => {
  it('loads families and downloads the selected variant directly', async () => {
    const t = fixture(ops)
    t.ctx.update((s) => ({ ...s, libraryQuery: 'small' }))
    const libraryRows = await loadVariantCatalog(t.ctx, format)
    expect(t.execute).toHaveBeenCalledWith('models.search', { engine, query: 'small' })
    expect(libraryRows[0]?.source).toMatchObject({ format, engine })
    t.ctx.update((s) => ({ ...s, libraryRows, catalogOpen: 'model', catalogVariant: 'model-cpu' }))
    await variantCatalogAction('catalog-download:0', t.ctx)
    expect(t.execute).toHaveBeenCalledWith(`${ops}.plan`, { model: 'model', variant: 'model-cpu' })
    expect(t.execute).toHaveBeenCalledWith(`${ops}.install`, {
      request_id: expect.stringMatching(/^terminal-/),
      plan_digest: 'checked-plan',
    })
    expect(t.get()).toMatchObject({ overlay: null, libraryView: 'catalog', catalogOpen: 'model' })
  })
  it('prepares a missing accelerator in place before offering the download', async () => {
    const t = fixture(ops, 'accelerator-not-prepared')
    const libraryRows = await loadVariantCatalog(t.ctx, format)
    t.ctx.update((s) => ({ ...s, libraryRows, catalogOpen: 'model', catalogVariant: 'model-cpu' }))
    await variantCatalogAction('catalog-download:0', t.ctx)
    expect(t.execute).toHaveBeenCalledWith(`${ops}.prepare`, {})
    expect(t.execute).not.toHaveBeenCalledWith(`${ops}.install`, expect.anything())
    expect(variantNext(t.get().libraryRows[0]?.source, 'model-cpu').action).toBe('download')
    expect(t.get().catalogOpen).toBe('model')
    expect(variantNext({ variants: [variant('engine-not-installed')] }, 'model-cpu').action).toBe('engine')
  })
  it('continues the same request when an install of the same plan is retried', async () => {
    const t = fixture(ops)
    let fail = true
    const answer = t.execute.getMockImplementation()!
    t.execute.mockImplementation(async (name: string, input?: unknown) => {
      if (name === `${ops}.install` && fail) {
        fail = false
        throw new Error('Lost connection')
      }
      return answer(name, input)
    })
    const libraryRows = await loadVariantCatalog(t.ctx, format)
    t.ctx.update((s) => ({ ...s, libraryRows, catalogVariant: 'model-cpu' }))
    await expect(variantCatalogAction('catalog-download:0', t.ctx)).rejects.toThrow('Lost connection')
    await variantCatalogAction('catalog-download:0', t.ctx)
    const requests = t.execute.mock.calls.filter(([name]) => name === `${ops}.install`).map(([, i]) => i)
    expect(requests).toEqual([
      { request_id: 'terminal-checked-plan', plan_digest: 'checked-plan' },
      { request_id: 'terminal-checked-plan', plan_digest: 'checked-plan' },
    ])
  })
  it('keeps an incompatible variant out of the download queue', async () => {
    const t = fixture(ops, 'ok', ['Not enough disk space'])
    const libraryRows = await loadVariantCatalog(t.ctx, format)
    t.ctx.update((s) => ({ ...s, libraryRows }))
    await expect(variantCatalogAction('catalog-download:0', t.ctx)).rejects.toThrow('Not enough disk space')
    expect(t.execute).not.toHaveBeenCalledWith(`${ops}.install`, expect.anything())
    expect(t.get().busy).toBe(false)
  })
})
it('leaves a GGUF row to the plain download', async () => {
  const t = fixture('foundry')
  t.ctx.update((s) => ({
    ...s,
    libraryRows: [{ id: 'm', name: 'M', description: '', category: 'text', source: {} }],
  }))
  expect(await variantCatalogAction('catalog-download:0', t.ctx)).toBe(false)
})
