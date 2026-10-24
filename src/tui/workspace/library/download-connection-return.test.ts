import { expect, it, vi } from 'vitest'
import { activate, type ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace, type WorkspaceState } from '../state.js'
import { escapeAction } from '../escape-action.js'
import { workspaceFrame } from '../frame.js'

const job = {
  id: 'pending',
  stage: 'downloading_model',
  plan: { model_id: 'chosen', provider: 'llamacpp-upstream', total_download_bytes: 100 },
}
function fixture(two = false) {
  let state: WorkspaceState = {
    ...createWorkspace('welcome'),
    firstRun: 'connect',
    workspace: {
      api: { port: 1337 },
      setups: two ? [job, { ...job, id: 'second' }] : [job],
      downloads: [],
    } as never,
  }
  let snapshot = state.workspace!
  const execute = vi.fn(async (name: string, input: Record<string, unknown> = {}) => {
    if (name === 'setup.cancel' || name === 'setup.resume')
      snapshot = {
        ...snapshot,
        setups: snapshot.setups.map((value) => {
          const current = value as typeof job
          return current.id === input['setup_id']
            ? { ...current, stage: name === 'setup.cancel' ? 'cancelled' : 'downloading_model' }
            : current
        }),
      }
    if (name === 'downloads.remove')
      snapshot = {
        ...snapshot,
        setups: snapshot.setups.filter((value) => (value as typeof job).id !== input['id']),
      }
    return {}
  })
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    copy: vi.fn(),
    cancel: vi.fn(),
    send: vi.fn(),
    controller: {
      installed: async () => [],
      runtime: { execute, snapshot: async () => snapshot },
    } as unknown as WorkspaceController,
  }
  return { ctx, execute }
}

it.each(['agent', 'endpoint'])(
  'preserves the open %s review through game, pause, resume, cancel removal, and remove',
  async (path) => {
    const { ctx, execute } = fixture()
    await activate('guide-agent:codex', ctx)
    if (path === 'endpoint')
      ctx.update((s) => ({ ...s, connection: { ...s.connection!, path: 'endpoint', port: '1777' } }))
    const draft = ctx.get().connection
    await activate('guide-game', ctx)
    await activate(escapeAction(ctx.get()).id, ctx)
    ctx.update((s) => ({ ...s, focus: 'download-pause:setup:pending' }))
    await activate('download-pause:setup:pending', ctx)
    expect(ctx.get()).toMatchObject({
      overlay: 'connection-guide',
      firstRun: 'connect',
      page: 'welcome',
      focus: 'download-resume:setup:pending',
    })
    expect(ctx.get().connection).toBe(draft)
    expect(ctx.get().workspace?.setups).toMatchObject([{ stage: 'cancelled' }])
    await activate('download-resume:setup:pending', ctx)
    expect(ctx.get()).toMatchObject({ overlay: 'connection-guide', focus: 'download-pause:setup:pending' })
    expect(ctx.get().connection).toBe(draft)
    await activate('download-remove:setup:pending', ctx)
    expect(ctx.get().overlay).toBe('download-remove')
    await activate(escapeAction(ctx.get()).id, ctx)
    expect(ctx.get().overlay).toBe('connection-guide')
    expect(ctx.get().connection).toBe(draft)
    expect(execute).not.toHaveBeenCalledWith('downloads.remove', expect.anything())
    await activate('download-remove:setup:pending', ctx)
    await activate('download-remove-confirm', ctx)
    expect(ctx.get()).toMatchObject({
      overlay: 'connection-guide',
      focus: 'guide-model',
      firstRun: 'connect',
      page: 'welcome',
    })
    expect(ctx.get().connection).toBe(draft)
    expect(ctx.get().workspace?.setups).toEqual([])
    expect(workspaceFrame(ctx.get(), 54, 24, 0).targets.some((target) => target.id === 'guide-model')).toBe(
      true
    )
    expect(execute).not.toHaveBeenCalledWith('models.load', expect.anything())
  }
)

it('returns download detail Escape and its pause action to the same connection review', async () => {
  const { ctx } = fixture()
  await activate('guide-agent:codex', ctx)
  const draft = ctx.get().connection
  for (const action of ['close', 'download-do:pause']) {
    await activate('download-row:0', ctx)
    expect(ctx.get().overlay).toBe('download-detail')
    await activate(action, ctx)
    expect(ctx.get().overlay).toBe('connection-guide')
    expect(ctx.get().connection).toBe(draft)
  }
})

it.each(['other-confirmation', 'other-detail', 'same-confirmation', 'left-guide'])(
  'does not let delayed removal replace %s opened after Escape',
  async (next) => {
    const { ctx, execute } = fixture(true)
    await activate('guide-agent:codex', ctx)
    await activate('download-remove:setup:pending', ctx)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const original = execute.getMockImplementation()!
    execute.mockImplementationOnce(async (name, input) => {
      await gate
      return original(name, input)
    })
    const removal = activate('download-remove-confirm', ctx)
    await activate('close', ctx)
    if (next === 'other-confirmation') await activate('download-remove:setup:second', ctx)
    else if (next === 'other-detail') await activate('download-row:1', ctx)
    else if (next === 'same-confirmation') await activate('download-remove:setup:pending', ctx)
    else ctx.update((s) => ({ ...s, page: 'settings', overlay: null, focus: 'settings:general' }))
    const { overlay, focus, page, downloadSelection } = ctx.get()
    release()
    await removal
    expect(ctx.get()).toMatchObject({ overlay, focus, page })
    expect(ctx.get().downloadSelection).toBe(downloadSelection)
    expect(ctx.get().workspace?.setups).toMatchObject([{ id: 'second' }])
  }
)

it('does not close a newer download detail when an earlier detail pause finishes', async () => {
  const { ctx, execute } = fixture(true)
  await activate('guide-agent:codex', ctx)
  await activate('download-row:0', ctx)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const original = execute.getMockImplementation()!
  execute.mockImplementationOnce(async (name, input) => {
    await gate
    return original(name, input)
  })
  const pause = activate('download-do:pause', ctx)
  await activate('close', ctx)
  await activate('download-row:1', ctx)
  const newer = ctx.get().downloadSelection
  release()
  await pause
  expect(ctx.get().overlay).toBe('download-detail')
  expect(ctx.get().downloadSelection).toBe(newer)
  expect(ctx.get().workspace?.setups).toMatchObject([
    { id: 'pending', stage: 'cancelled' },
    { id: 'second', stage: 'downloading_model' },
  ])
})

it('keeps the active review and selected model when a download mutation fails', async () => {
  const { ctx, execute } = fixture()
  await activate('guide-agent:codex', ctx)
  const draft = ctx.get().connection
  execute.mockRejectedValueOnce(new Error('Download could not be paused'))
  await expect(activate('download-pause:setup:pending', ctx)).rejects.toThrow('could not be paused')
  expect(ctx.get().overlay).toBe('connection-guide')
  expect(ctx.get().connection).toBe(draft)
})
