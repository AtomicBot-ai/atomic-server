import { expect, it, vi } from 'vitest'
import type { SetupSelection } from '../../../terminal-setup/index.js'
import type { ActionContext } from '../actions.js'
import { activate } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import { escapeAction } from '../escape-action.js'

const selection = {
  request: { repo: 'repo/new', file: 'new.gguf' },
  requestId: 'download',
  plan: { model_id: 'new-model', provider: 'llamacpp-upstream', engine: null },
} as SetupSelection
function fixture(onboarding = true) {
  let state: WorkspaceState = {
    ...createWorkspace(onboarding ? 'welcome' : 'server'),
    firstRun: onboarding ? ('connect' as const) : null,
    setupComplete: !onboarding,
  }
  const execute = vi.fn(async () => ({}))
  const plan = vi.fn(async () => selection)
  const begin = vi.fn(async () => ({ manifest: { startedAt: 10 } }))
  const installed = [
    { id: 'old-model', name: 'Old model', provider: 'llamacpp-upstream' },
    { id: 'installed-model', name: 'Installed model', provider: 'llamacpp-upstream' },
  ]
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
      save: vi.fn(),
      initializeKeys: vi.fn(async () => undefined),
      hub: async () => [{ id: 'repo/new', title: 'New model' }],
      files: async () => [{ filename: 'new.gguf', size: 1000 }],
      setup: {
        catalogs: async () => [
          {
            provider: 'llamacpp-upstream',
            recommended: 'v1/cpu',
            available: [{ version: 'v1', backend: 'cpu' }],
          },
        ],
        engines: async () => ['llamacpp-upstream'],
        installed: async () => ['llamacpp-upstream'],
        plan,
        begin,
      },
      runtime: { execute },
    } as unknown as WorkspaceController,
  }
  return { ctx, plan, begin, execute }
}
it.each([true, false])(
  'keeps the selected agent and review when choosing an installed model (onboarding=%s)',
  async (onboarding) => {
    const { ctx } = fixture(onboarding)
    await activate('guide-agent:codex', ctx)
    await activate('guide-models', ctx)
    expect(ctx.get().connection).toMatchObject({ step: 'review', agent: 'codex', pickingModel: true })
    expect(ctx.get().firstRun).toBe(onboarding ? 'connect' : null)
    await activate('first-installed:1', ctx)
    expect(ctx.get()).toMatchObject({ overlay: 'connection-guide', firstRun: onboarding ? 'connect' : null })
    expect(ctx.get().connection).toMatchObject({
      step: 'review',
      agent: 'codex',
      model: 'installed-model',
      pickingModel: false,
    })
  }
)
it('returns a new download to the same endpoint review and waits for that model', async () => {
  const { ctx, begin, execute } = fixture()
  await activate('guide-open', ctx)
  await activate('guide-path:endpoint', ctx)
  await activate('guide-port', ctx)
  ctx.update((s) => ({ ...s, editValue: '1777' }))
  await activate('save-edit', ctx)
  await activate('guide-next', ctx)
  await activate('guide-models', ctx)
  expect(ctx.get().setup?.error).toBe('')
  expect(ctx.get().setup).toMatchObject({
    stage: 'models',
    busy: false,
    repositories: [{ id: 'repo/new', title: 'New model' }],
  })
  await activate('setup-repo:0', ctx)
  expect(begin).toHaveBeenCalledOnce()
  expect(ctx.get()).toMatchObject({ firstRun: 'connect', overlay: 'connection-guide', page: 'welcome' })
  expect(ctx.get().connection).toMatchObject({
    step: 'review',
    path: 'endpoint',
    port: '1777',
    model: 'new-model',
    pickingModel: false,
  })
  await activate('guide-configure', ctx)
  expect(execute).not.toHaveBeenCalled()
  expect(ctx.get().connection?.step).toBe('review')
})
it('keeps the draft through a failed plan, retries the download, and returns to the same review', async () => {
  const { ctx, plan, begin } = fixture()
  plan.mockRejectedValueOnce(new Error('Model service unavailable'))
  await activate('guide-agent:codex', ctx)
  await activate('guide-models', ctx)
  expect(ctx.get().setup?.error).toBe('')
  expect(ctx.get().setup).toMatchObject({
    stage: 'models',
    busy: false,
    repositories: [{ id: 'repo/new', title: 'New model' }],
  })
  await activate('setup-repo:0', ctx)
  expect(ctx.get().setup?.error).toContain('Model service unavailable')
  expect(ctx.get().connection).toMatchObject({ agent: 'codex', step: 'review', pickingModel: true })
  expect(begin).not.toHaveBeenCalled()
  await activate('setup-retry', ctx)
  expect(begin).toHaveBeenCalledOnce()
  expect(ctx.get().connection).toMatchObject({
    agent: 'codex',
    step: 'review',
    pickingModel: false,
    model: 'new-model',
  })
  expect(ctx.get().firstRun).toBe('connect')
})
it('explicit Back cancels only the picker and preserves the previous selection', async () => {
  const { ctx, begin } = fixture()
  await activate('guide-agent:codex', ctx)
  await activate('guide-models', ctx)
  expect(escapeAction(ctx.get()).id).toBe('guide-model-back')
  await activate('guide-model-back', ctx)
  expect(ctx.get().connection).toMatchObject({
    step: 'review',
    agent: 'codex',
    model: 'old-model',
    pickingModel: false,
  })
  expect(ctx.get().overlay).toBe('connection-guide')
  expect(begin).not.toHaveBeenCalled()
})
