import { expect, it, vi } from 'vitest'
import { createWorkspace } from '../state.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { foundryCatalogAction, foundryNext, loadFoundryCatalog } from './catalog-foundry.js'
const variant = (verdict = 'ok') => ({ id: 'model-cpu', size_bytes: 1000, verdict: { verdict } })
function fixture(verdict = 'ok', blockers: string[] = []) {
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
  const execute = vi.fn(async (name: string) => {
    if (name === 'models.search') return { models: models() }
    if (name === 'foundry.prepare') {
      verdict = 'ok'
      return {}
    }
    if (name === 'foundry.plan') return { digest: 'checked-plan', blockers }
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
it('loads Foundry families into Local models and downloads the selected variant directly', async () => {
  const t = fixture()
  t.ctx.update((s) => ({ ...s, libraryQuery: 'small' }))
  const libraryRows = await loadFoundryCatalog(t.ctx)
  expect(t.execute).toHaveBeenCalledWith('models.search', { engine: 'foundry-local', query: 'small' })
  t.ctx.update((s) => ({ ...s, libraryRows, catalogOpen: 'model', catalogVariant: 'model-cpu' }))
  await foundryCatalogAction('catalog-download:0', t.ctx)
  expect(t.execute).toHaveBeenCalledWith('foundry.plan', { model: 'model', variant: 'model-cpu' })
  expect(t.execute).toHaveBeenCalledWith('foundry.install', {
    request_id: expect.stringMatching(/^terminal-/),
    plan_digest: 'checked-plan',
  })
  expect(t.get()).toMatchObject({ overlay: null, libraryView: 'catalog', catalogOpen: 'model' })
})
it('prepares a missing accelerator in place before offering the download', async () => {
  const t = fixture('accelerator-not-prepared')
  const libraryRows = await loadFoundryCatalog(t.ctx)
  t.ctx.update((s) => ({ ...s, libraryRows, catalogOpen: 'model', catalogVariant: 'model-cpu' }))
  await foundryCatalogAction('catalog-download:0', t.ctx)
  expect(t.execute).toHaveBeenCalledWith('foundry.prepare', {})
  expect(t.execute).not.toHaveBeenCalledWith('foundry.install', expect.anything())
  expect(foundryNext(t.get().libraryRows[0]?.source, 'model-cpu').action).toBe('download')
  expect(t.get().catalogOpen).toBe('model')
  expect(foundryNext({ variants: [variant('engine-not-installed')] }, 'model-cpu').action).toBe('engine')
})
it('keeps an incompatible variant out of the download queue', async () => {
  const t = fixture('ok', ['Not enough disk space'])
  const libraryRows = await loadFoundryCatalog(t.ctx)
  t.ctx.update((s) => ({ ...s, libraryRows }))
  await expect(foundryCatalogAction('catalog-download:0', t.ctx)).rejects.toThrow('Not enough disk space')
  expect(t.execute).not.toHaveBeenCalledWith('foundry.install', expect.anything())
  expect(t.get().busy).toBe(false)
})
