import { expect, it, vi } from 'vitest'
import { createWorkspace } from '../state.js'
import type { WorkspaceController } from '../controller.js'
import { activate, type ActionContext } from '../actions.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { hit } from '../draw/canvas.js'
import { waitingSetupAction } from './waiting-setup.js'
import { floatingDownloadBounds } from '../download-layout.js'
function fixture() {
  let state = {
    ...createWorkspace('welcome'),
    firstRun: 'connect' as const,
    model: 'qwen',
    workspace: {
      setups: [
        { id: 'download', stage: 'downloading', plan: { model_id: 'qwen', total_download_bytes: 100 } },
      ],
      downloads: [],
    } as never,
  } as ReturnType<typeof createWorkspace>
  const execute = vi.fn(async () => ({}))
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    send: vi.fn(),
    copy: vi.fn(),
    cancel: vi.fn(),
    controller: { runtime: { execute } } as unknown as WorkspaceController,
  }
  return { ctx, execute, action: (id: string) => activate(id, ctx) }
}
it.each([
  [54, 24],
  [120, 36],
])(
  'keeps final waiting game, email confirmation and background exit usable at %ix%i',
  async (width, height) => {
    const t = fixture()
    await t.action('first-connect:agent')
    expect(t.execute).not.toHaveBeenCalled()
    expect(t.ctx.get().finalSetup?.destination).toBe('agent')
    const frame = workspaceFrame(t.ctx.get(), width!, height!, 0)
    for (const id of [
      'wait-cell:0',
      'wait-new',
      'wait-email',
      'wait-save',
      'wait-continue',
      'download-status',
    ]) {
      const target = frame.targets.find((t) => t.id === id)!
      expect(target, id).toBeDefined()
      expect(hit(frame, target.x, target.y)?.id, id).toBe(id)
    }
    const email = frame.targets.find((target) => target.id === 'wait-email')!
    const confirm = frame.targets.find((target) => target.id === 'wait-save')!
    expect(confirm.x).toBeGreaterThan(email.x + email.width)
    expect(confirm.y + 1).toBe(email.y)
    const card = floatingDownloadBounds(frame, t.ctx.get())!
    for (const target of frame.targets.filter((target) => target.id.startsWith('wait-')))
      expect(target.y).toBeGreaterThanOrEqual(card.y + card.height)
    t.ctx.update((s) => ({ ...s, focus: 'wait-cell:63' }))
    const scrolled = workspaceFrame(t.ctx.get(), width!, height!, 0)
    expect(scrolled.targets.some((target) => target.id === 'wait-cell:63')).toBe(true)
    expect(scrolled.targets.every((target) => target.y + target.height <= height!)).toBe(true)
    await t.action('wait-cell:0')
    expect(t.ctx.get().finalSetup?.game.opened).toContain(0)
    expect(t.ctx.get().finalSetup?.game.exploded).toBeNull()
    const covered = Array.from({ length: 64 }, (_, i) => i).find(
      (i) => !t.ctx.get().finalSetup?.game.opened.includes(i)
    )!
    t.ctx.update((s) => ({ ...s, focus: `wait-cell:${covered}` }))
    const input = workspaceInput('f', {} as never, t.ctx.get(), frame)
    t.ctx.update((s) => ({ ...s, ...input.patch }))
    expect(t.ctx.get().finalSetup?.game.flags).toContain(covered)
    await t.action('wait-continue')
    expect(t.execute).toHaveBeenCalledExactlyOnceWith('setup.manual')
    expect(t.ctx.get()).toMatchObject({
      firstRun: null,
      finalSetup: null,
      page: 'server',
      serverView: 'overview',
    })
  }
)
it('keeps email confirmation local, validates it, and Escape returns to the explicit destination choice', async () => {
  const t = fixture()
  await t.action('first-connect:endpoint')
  await t.action('wait-save')
  expect(t.ctx.get().finalSetup?.emailStatus).toBe('invalid')
  const input = workspaceInput(
    'test@example.com',
    {} as never,
    t.ctx.get(),
    workspaceFrame(t.ctx.get(), 120, 36, 0)
  )
  t.ctx.update((s) => ({ ...s, ...input.patch }))
  await t.action('wait-save')
  expect(t.ctx.get().finalSetup?.emailStatus).toBe('confirmed')
  expect(t.execute).not.toHaveBeenCalled()
  const back = workspaceInput(
    '',
    { escape: true } as never,
    t.ctx.get(),
    workspaceFrame(t.ctx.get(), 120, 36, 0)
  )
  await t.action(back.action!)
  expect(t.ctx.get()).toMatchObject({
    firstRun: 'connect',
    finalSetup: null,
    focus: 'first-connect:endpoint',
  })
})

it('exposes confirming state, prevents duplicate saves, and never revives a closed waiting screen', async () => {
  const t = fixture()
  await t.action('first-connect:endpoint')
  t.ctx.update((s) => ({ ...s, finalSetup: { ...s.finalSetup!, email: 'person@example.com' } }))
  vi.useFakeTimers()
  try {
    const saving = waitingSetupAction('wait-save', t.ctx)
    expect(t.ctx.get().finalSetup?.emailStatus).toBe('confirming')
    await waitingSetupAction('wait-save', t.ctx)
    expect(t.execute).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(400)
    await saving
    expect(t.ctx.get().finalSetup?.emailStatus).toBe('confirmed')
    t.ctx.update((s) => ({ ...s, focus: 'wait-email' }))
    const edit = workspaceInput('x', {} as never, t.ctx.get(), workspaceFrame(t.ctx.get(), 120, 36, 0))
    t.ctx.update((s) => ({ ...s, ...edit.patch }))
    expect(t.ctx.get().finalSetup?.emailStatus).toBe('idle')
    const next = waitingSetupAction('wait-save', t.ctx)
    await waitingSetupAction('wait-back', t.ctx)
    await vi.advanceTimersByTimeAsync(400)
    await next
    expect(t.ctx.get().finalSetup).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})
