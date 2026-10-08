import { describe, expect, it, vi } from 'vitest'
import { activate, example, serverEndpoint } from './actions.js'
import type { ActionContext } from './actions.js'
import { createWorkspace } from './state.js'
import type { WorkspaceController } from './controller.js'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
function context() {
  let state = createWorkspace('chat')
  const save = vi.fn(async () => undefined),
    api = vi.fn(async () => undefined),
    run = vi.fn(async () => undefined),
    models = vi.fn(async () => ['one'])
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: { save, api, run, models } as unknown as WorkspaceController,
    copy: vi.fn(),
    send: vi.fn(),
    cancel: vi.fn(),
  }
  return { ctx, save, api, run, models }
}
describe('workspace actions', () => {
  it('persists first-run selection and model selection, while preserving the draft through navigation', async () => {
    const { ctx, save } = context()
    ctx.update((s) => ({ ...s, draft: 'Keep this' }))
    await activate('personal', ctx)
    expect(save).toHaveBeenCalledWith('tui.mode', 'personal')
    await activate('page:models', ctx)
    await activate('model:0', ctx)
    expect(ctx.get()).toMatchObject({ page: 'chat', model: 'one', draft: 'Keep this', focus: 'composer' })
    await activate('new', ctx)
    expect(ctx.cancel).toHaveBeenCalled()
    expect(ctx.get().draft).toBe('')
  })
  it('requires an explicit second action to stop the API; copying uses the server endpoint', async () => {
    const { ctx, api } = context(),
      snapshot = fakeCoreLink().snapshotValue
    snapshot.server = { ...snapshot.server, running: true, host: '0.0.0.0', port: 3210 }
    ctx.update((s) => ({
      ...s,
      base: { ...s.base, daemon: { kind: 'up', snapshot, record: undefined, pending: [] } },
    }))
    await activate('api-toggle', ctx)
    expect(api).not.toHaveBeenCalled()
    expect(ctx.get().overlay).toBe('stop')
    await activate('close', ctx)
    expect(api).not.toHaveBeenCalled()
    await activate('copy-endpoint', ctx)
    expect(ctx.copy).toHaveBeenCalledWith('http://127.0.0.1:3210/v1')
    expect(serverEndpoint(ctx.get())).toBe('http://127.0.0.1:3210/v1')
    expect(example(ctx.get())).toContain('3210/v1')
    expect(example(ctx.get())).toContain('$ATC_API_KEY')
    await activate('stop-confirm', ctx)
    expect(api).toHaveBeenCalledWith(false)
  })
  it('validates endpoints before writing and does not send a test request to an unrelated endpoint', async () => {
    const { ctx, save, models } = context()
    await activate('endpoint', ctx)
    ctx.update((s) => ({ ...s, editValue: 'file:///secret' }))
    await expect(activate('save-edit', ctx)).rejects.toThrow()
    expect(save).not.toHaveBeenCalled()
    await activate('test-request', ctx)
    expect(models).not.toHaveBeenCalled()
    expect(ctx.get().message).toContain('Start the API')
  })
})
