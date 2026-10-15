import { describe, expect, it, vi } from 'vitest'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import { WORKSPACE_OPERATIONS } from '../../../contract/index.js'
function fixture() {
  let state = { ...createWorkspace('server'), setupComplete: true, operations: [...WORKSPACE_OPERATIONS] }
  const execute = vi.fn(async (_name: string, _input: Record<string, unknown>) => ({ ok: true }))
  const save = vi.fn(async () => undefined)
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: { runtime: { execute, snapshot: async () => null }, save } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  return { ctx, execute, save }
}
describe('shared TUI operations', () => {
  it('skips the wizard through the shared persisted setup operation', async () => {
    const { ctx, execute, save } = fixture()
    ctx.update((s) => ({ ...s, setupComplete: false, page: 'welcome' }))
    await activate('setup-manual', ctx)
    expect(execute).toHaveBeenCalledWith('setup.manual')
    expect(save).toHaveBeenCalledWith('tui.mode', 'server')
    expect(ctx.get()).toMatchObject({ page: 'server', setupComplete: true, overlay: null })
  })
  it('executes typed console input without shell interpretation', async () => {
    const { ctx, execute } = fixture()
    await activate('console', ctx)
    ctx.update((s) => ({
      ...s,
      consoleInput: 'models.load {"provider":"llamacpp-upstream","model_id":"model $(touch x)"}',
    }))
    await activate('console-run', ctx)
    expect(execute).toHaveBeenCalledWith('models.load', {
      provider: 'llamacpp-upstream',
      model_id: 'model $(touch x)',
    })
    expect(ctx.get().operationResult).toContain('true')
    expect(ctx.get().busy).toBe(false)
  })
  it('edits media fields and sends them to the same backend operation used by agents', async () => {
    const { ctx, execute } = fixture()
    ctx.update((s) => ({ ...s, page: 'tools', operation: 'media.image.create' }))
    await activate('operation-field:request.prompt', ctx)
    ctx.update((s) => ({ ...s, editValue: 'A forest' }))
    await activate('save-edit', ctx)
    await activate('operation-field:request.workflow', ctx)
    const choice = ctx.get().operationChoices.indexOf('transform')
    await activate(`operation-choice:${choice}`, ctx)
    await activate('operation-run', ctx)
    expect(execute).toHaveBeenCalledWith('media.image.create', {
      request: { prompt: 'A forest', workflow: 'transform' },
    })
  })
  it('keeps an interrupted API restart behind a separate confirmation', async () => {
    const { ctx, execute } = fixture()
    ctx.update((s) => ({ ...s, workspace: { api: { running: true } } as never }))
    await activate('api-restart', ctx)
    expect(execute).not.toHaveBeenCalled()
    expect(ctx.get()).toMatchObject({ overlay: 'stop', edit: 'api-restart' })
    await activate('stop-confirm', ctx)
    expect(execute).toHaveBeenCalledWith('api.restart')
  })
})
