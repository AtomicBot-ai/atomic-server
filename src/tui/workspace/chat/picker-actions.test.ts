import { expect, it, vi } from 'vitest'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceController } from '../controller.js'
import { workspaceFrame } from '../frame.js'

function harness() {
  let state = { ...createWorkspace('chat'), setupComplete: true, draft: 'Keep my draft', model: 'local' }
  const select = vi.fn(async () => {}),
    loadModel = vi.fn(async () => {}),
    save = vi.fn(async () => {})
  const installed = [{ id: 'local', name: 'My model', provider: 'llamacpp-upstream' }]
  const engine = {
    id: 'llamacpp|v1|cpu',
    provider: 'llamacpp',
    version: 'v1',
    backend: 'cpu',
    installed: true,
  }
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    send: vi.fn(),
    copy: vi.fn(),
    cancel: vi.fn(),
    controller: {
      installed: async () => installed,
      models: async () => {
        throw new Error('Offline')
      },
      engineSelection: { list: async () => [engine], select },
      setup: {
        catalogs: async () => [
          { provider: 'llamacpp', recommended: 'v1/cpu', available: [{ version: 'v1', backend: 'cpu' }] },
        ],
        read: async () => ({ complete: true }),
      },
      loadModel,
      save,
      localEndpoint: async () => 'http://127.0.0.1:1337/v1',
      config: async () => ({ values: { tui: { mode: 'personal' } } }),
      initializeKeys: async () => {},
      hub: async () => [],
    } as unknown as WorkspaceController,
  }
  return { ctx, select, loadModel, save, engine, installed }
}
it('switches a local model to the selected engine and returns to the intact composer', async () => {
  const { ctx, select, loadModel, engine, installed } = harness()
  ctx.update((s) => ({ ...s, installed }))
  await activate('choose-engine', ctx)
  await activate('pick-engine:0', ctx)
  expect(select).toHaveBeenCalledWith(engine)
  expect(loadModel).toHaveBeenCalledWith('llamacpp', 'local')
  expect(ctx.get()).toMatchObject({
    page: 'chat',
    overlay: null,
    focus: 'composer',
    model: 'local',
    engine: engine.id,
    draft: 'Keep my draft',
  })
})
it('keeps local models usable while an endpoint is offline and closes the popover on selection', async () => {
  const { ctx, loadModel } = harness()
  await activate('choose-model', ctx)
  expect(ctx.get()).toMatchObject({ page: 'chat', overlay: 'model-picker', focus: 'installed:0' })
  await activate('installed:0', ctx)
  expect(loadModel).toHaveBeenCalledWith('llamacpp-upstream', 'local')
  expect(ctx.get()).toMatchObject({ overlay: null, draft: 'Keep my draft', focus: 'composer' })
})
it('opens later downloads in Models without numbered onboarding, retaining completion and draft', async () => {
  const { ctx } = harness()
  await activate('install-models', ctx)
  expect(ctx.get()).toMatchObject({
    page: 'models',
    setupComplete: true,
    draft: 'Keep my draft',
    setup: { stage: 'engine' },
  })
  const visible = workspaceFrame(ctx.get(), 120, 36, 0)
    .cells.map((r) => r.map((c) => c.char).join(''))
    .join('\n')
  expect(visible).toContain('Inference engines')
  expect(visible).not.toContain('01 Engine')
  expect(visible).not.toContain('SET UP YOUR')
  await activate('library-close', ctx)
  expect(ctx.get()).toMatchObject({ page: 'models', setup: null, setupComplete: true })
  await activate('switch-mode', ctx)
  expect(ctx.get()).toMatchObject({ page: 'models', overlay: 'workspace' })
  await activate('hosting', ctx)
  expect(ctx.get()).toMatchObject({ page: 'server', overlay: null, setupComplete: true })
})
