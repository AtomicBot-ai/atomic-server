import { expect, it, vi } from 'vitest'
import { createWorkspace } from '../state.js'
import type { WorkspaceController } from '../controller.js'
import { activate, type ActionContext } from '../actions.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { hit } from '../draw/canvas.js'
import { waitingSetupAction } from './waiting-setup.js'
import { floatingDownloadBounds } from '../downloads/download-layout.js'
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
  'keeps final waiting game, the model-ready email and background exit usable at %ix%i',
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
const shown = (state: ReturnType<typeof createWorkspace>, width = 120, height = 36) =>
  workspaceFrame(state, width, height, 0)
    .cells.map((row) => row.map((cell) => cell.char).join(''))
    .join('\n')

it('registers the address with the server, validates it, and Escape returns to the explicit destination choice', async () => {
  const t = fixture()
  await t.action('first-connect:endpoint')
  expect(shown(t.ctx.get())).toContain('You agree to one email when this model is ready')
  await t.action('wait-save')
  expect(t.ctx.get().finalSetup?.emailStatus).toBe('invalid')
  expect(t.execute).not.toHaveBeenCalled()
  const input = workspaceInput(
    'test@example.com',
    {} as never,
    t.ctx.get(),
    workspaceFrame(t.ctx.get(), 120, 36, 0)
  )
  t.ctx.update((s) => ({ ...s, ...input.patch }))
  await t.action('wait-save')
  expect(t.execute).toHaveBeenCalledExactlyOnceWith('setup.reminder', { email: 'test@example.com' })
  expect(t.ctx.get().finalSetup).toMatchObject({ email: '', emailStatus: 'saved' })
  expect(shown(t.ctx.get())).toContain("Reminder set. We'll email you when it is ready.")
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

it("shows saving, sends once, shows the server's refusal, and never revives a closed waiting screen", async () => {
  const t = fixture()
  await t.action('first-connect:endpoint')
  t.ctx.update((s) => ({ ...s, finalSetup: { ...s.finalSetup!, email: 'person@example.com' } }))
  let refuse!: (error: Error) => void
  t.execute.mockImplementationOnce(() => new Promise((_, reject) => (refuse = reject)))
  const saving = waitingSetupAction('wait-save', t.ctx)
  expect(t.ctx.get().finalSetup?.emailStatus).toBe('saving')
  expect(shown(t.ctx.get())).toContain('Saving your reminder...')
  await waitingSetupAction('wait-save', t.ctx)
  expect(t.execute).toHaveBeenCalledOnce()
  refuse(new Error('Too many requests. Try again in an hour.'))
  await saving
  expect(t.ctx.get().finalSetup).toMatchObject({ emailStatus: 'failed', email: 'person@example.com' })
  expect(shown(t.ctx.get())).toContain('Too many requests. Try again in an hour.')
  t.ctx.update((s) => ({ ...s, focus: 'wait-email' }))
  const edit = workspaceInput('x', {} as never, t.ctx.get(), workspaceFrame(t.ctx.get(), 120, 36, 0))
  t.ctx.update((s) => ({ ...s, ...edit.patch }))
  expect(t.ctx.get().finalSetup?.emailStatus).toBe('idle')
  let accept!: () => void
  t.execute.mockImplementationOnce(() => new Promise((resolve) => (accept = () => resolve({}))))
  const next = waitingSetupAction('wait-save', t.ctx)
  await waitingSetupAction('wait-back', t.ctx)
  accept()
  await next
  expect(t.ctx.get().finalSetup).toBeNull()
})

it('shows the reminder the server keeps, and no email once the model is downloaded', async () => {
  const t = fixture()
  await t.action('first-connect:agent')
  t.ctx.update((s) => ({
    ...s,
    workspace: {
      ...s.workspace!,
      reminder: {
        setup_id: 'download',
        model: 'qwen',
        model_name: 'qwen',
        status: 'queued',
        registered_at: 1,
      },
    },
  }))
  expect(shown(t.ctx.get())).toContain('Reminder set.')
  t.ctx.update((s) => ({
    ...s,
    workspace: { ...s.workspace!, setups: [{ id: 'download', stage: 'ready', plan: { model_id: 'qwen' } }] },
  }))
  const frame = workspaceFrame(t.ctx.get(), 120, 36, 0)
  expect(frame.targets.some((target) => target.id === 'wait-email' || target.id === 'wait-save')).toBe(false)
  expect(shown(t.ctx.get())).not.toContain('Email me when it is ready')
  expect(shown(t.ctx.get())).toContain('Your model is downloaded')
})

it('reads the server before choosing a connection when the first snapshot has not arrived yet', async () => {
  const t = fixture()
  const pending = t.ctx.get().workspace
  t.ctx.update((s) => ({ ...s, workspace: null as never }))
  const snapshot = vi.fn(async () => pending)
  ;(t.ctx.controller.runtime as unknown as { snapshot: typeof snapshot }).snapshot = snapshot
  await t.action('first-connect:endpoint')
  expect(snapshot).toHaveBeenCalledOnce()
  expect(t.ctx.get().finalSetup?.destination).toBe('endpoint')
  expect(t.execute).not.toHaveBeenCalledWith('setup.manual')
})
it('waits when the server cannot say whether the first model is ready', async () => {
  const t = fixture()
  t.ctx.update((s) => ({ ...s, workspace: null as never }))
  ;(t.ctx.controller.runtime as unknown as { snapshot: () => Promise<never> }).snapshot = async () => {
    throw new Error('offline')
  }
  await t.action('first-connect:endpoint')
  expect(t.ctx.get().finalSetup?.destination).toBe('endpoint')
})
it('trusts the server over an older snapshot that does not list the download yet', async () => {
  const t = fixture()
  const pending = t.ctx.get().workspace
  t.ctx.update((s) => ({ ...s, workspace: { setups: [], downloads: [] } as never }))
  ;(t.ctx.controller.runtime as unknown as { snapshot: () => Promise<unknown> }).snapshot = async () =>
    pending
  await t.action('first-connect:endpoint')
  expect(t.ctx.get().finalSetup?.destination).toBe('endpoint')
})
