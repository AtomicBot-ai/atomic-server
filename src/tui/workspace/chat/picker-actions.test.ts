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
  expect(ctx.get()).toMatchObject({ page: 'server', overlay: null })
  await activate('hosting', ctx)
  expect(ctx.get()).toMatchObject({ page: 'server', overlay: null, setupComplete: true })
})

it('keeps a store model when the new engine lists it, and loads it there', async () => {
  const { ctx, loadModel } = harness()
  const store = { id: 'Qwen/Qwen3.5-2B', name: 'Qwen', provider: 'vllm', providers: ['vllm', 'tensorrt-llm'] }
  const trt = {
    id: 'tensorrt-llm',
    provider: 'tensorrt-llm',
    version: 'trt-1',
    backend: 'linux/amd64',
    installed: true,
  }
  ctx.update((s) => ({ ...s, installed: [store], model: store.id, engine: 'vllm', engines: [trt] }))
  ;(ctx.controller.engineSelection as { list: unknown }).list = async () => [trt]
  await activate('choose-engine', ctx)
  await activate('pick-engine:0', ctx)
  expect(loadModel).toHaveBeenCalledWith('tensorrt-llm', store.id)
  expect(ctx.get()).toMatchObject({ model: store.id, engine: 'tensorrt-llm' })
})

it('loads a store model with the provider of the row picked', async () => {
  const { ctx, loadModel } = harness()
  const store = { id: 'Qwen/Qwen3.5-2B', name: 'Qwen', provider: 'vllm', providers: ['vllm', 'tensorrt-llm'] }
  ctx.update((s) => ({ ...s, installed: [store], overlay: 'model-picker' }))
  await activate('installed:0:tensorrt-llm', ctx)
  expect(loadModel).toHaveBeenCalledWith('tensorrt-llm', store.id)
})

it('does not restore an engine switch’s old model after a newer model selection', async () => {
  const { ctx, loadModel, engine, installed, save } = harness()
  let finishEngineLoad!: () => void
  loadModel.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishEngineLoad = resolve
      })
  )
  const second = { id: 'newer', name: 'Newer model', provider: 'llamacpp-upstream' }
  ctx.update((s) => ({ ...s, installed: [...installed, second], engines: [engine] }))
  const old = activate('pick-engine:0', ctx)
  await vi.waitFor(() => expect(loadModel).toHaveBeenCalledTimes(1))
  await activate('installed:1', ctx)
  expect(ctx.get().model).toBe('newer')
  finishEngineLoad()
  await old
  expect(ctx.get()).toMatchObject({ model: 'newer', modelLoad: null, loadError: null, busy: false })
  expect(save).not.toHaveBeenCalledWith('tui.model', 'local')
})

it('ignores an engine selection that finishes after a newer model was chosen', async () => {
  const { ctx, select, loadModel, engine, installed, save } = harness()
  let finishSelection!: () => void
  select.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishSelection = resolve
      })
  )
  const second = { id: 'newer', name: 'Newer model', provider: 'llamacpp-upstream' }
  ctx.update((s) => ({ ...s, installed: [...installed, second], engines: [engine] }))
  const old = activate('pick-engine:0', ctx)
  await vi.waitFor(() => expect(select).toHaveBeenCalledOnce())
  await activate('installed:1', ctx)
  finishSelection()
  await old
  expect(ctx.get()).toMatchObject({ model: 'newer', modelLoad: null, pickerBusy: false })
  expect(loadModel).not.toHaveBeenCalledWith('llamacpp', 'local')
  expect(save).not.toHaveBeenCalledWith('tui.model', 'local')
})
