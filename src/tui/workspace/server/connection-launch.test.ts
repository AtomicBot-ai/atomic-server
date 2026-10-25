import { expect, it, vi } from 'vitest'
import { activate, type ActionContext } from '../actions.js'
import { createWorkspace, type WorkspaceState } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import type { WorkspaceController } from '../controller.js'
function fixture() {
  let s: WorkspaceState = {
    ...createWorkspace('welcome'),
    firstRun: 'connect',
    setupComplete: false,
    overlay: 'connection-guide',
    workspace: { api: { running: true } } as never,
    connection: {
      step: 'review',
      path: 'agent',
      agent: 'codex',
      model: 'chosen',
      provider: 'llamacpp',
      port: '1337',
      more: false,
      agentPage: 0,
      status: '',
      error: '',
      command: '',
      endpoint: 'http://127.0.0.1:1337/v1',
      keyId: '',
    },
  }
  const models = vi.fn(async () => ['chosen'])
  const ctx: ActionContext = {
    get: () => s,
    update: (fn) => {
      s = fn(s)
    },
    send: vi.fn(),
    copy: vi.fn(),
    cancel: vi.fn(),
    controller: { models } as unknown as WorkspaceController,
  }
  return { ctx, models }
}
it('requires a verified connection before launching during onboarding even with a running API', async () => {
  const { ctx, models } = fixture()
  expect(workspaceFrame(ctx.get(), 54, 24, 0).targets.some((t) => t.id === 'agent:codex')).toBe(false)
  await activate('agent:codex', ctx)
  expect(models).not.toHaveBeenCalled()
  expect(ctx.get().connection?.step).toBe('review')
  ctx.update((s) => ({ ...s, connection: { ...s.connection!, step: 'done' } }))
  expect(workspaceFrame(ctx.get(), 54, 24, 0).targets.some((t) => t.id === 'agent:codex')).toBe(true)
})
it.each(['review', 'done'] as const)(
  'returns Cancel/Escape from agent launch to the same %s draft',
  async (step) => {
    const { ctx } = fixture()
    ctx.update((s) => ({ ...s, overlay: 'agent', connection: { ...s.connection!, step } }))
    const draft = ctx.get().connection
    const input = workspaceInput(
      '',
      { escape: true } as never,
      ctx.get(),
      workspaceFrame(ctx.get(), 80, 24, 0)
    )
    await activate(input.action!, ctx)
    expect(ctx.get()).toMatchObject({ overlay: 'connection-guide', firstRun: 'connect' })
    expect(ctx.get().connection).toBe(draft)
    expect(workspaceFrame(ctx.get(), 80, 24, 0).targets.some((t) => t.id === ctx.get().focus)).toBe(true)
  }
)
