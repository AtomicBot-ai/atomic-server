import { applyWorkspaceSnapshot } from '../shared-state.js'
import type { WorkspaceSnapshot } from '../../../contract/index.js'
import { SERVER_SIDEBAR } from '../sidebar.js'
import { expect, it, vi } from 'vitest'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'
import type { WorkspaceController } from '../controller.js'
import { FIRST_RUN_STEPS } from '../../../contract/index.js'
import { hit } from '../draw/canvas.js'
function fixture(fail = false) {
  let state = { ...createWorkspace('server'), setupComplete: true }
  const execute = vi.fn(async (name: string) => {
    if (name === 'keys.list') return [{ id: 'key' }]
    if (name === 'connection.info') return { endpoint: 'http://localhost:1337/v1' }
    if (name === 'connection.profile') return { launch_command: 'atc connect codex --model local-model' }
    if (name === 'setup.complete' && fail) throw new Error('Inference failed')
    return {}
  })
  const ctx: ActionContext = {
    get: () => state,
    update: (f) => {
      state = f(state)
    },
    copy: vi.fn(),
    cancel: vi.fn(),
    send: vi.fn(),
    controller: {
      installed: async () => [{ id: 'local-model', name: 'Local model', provider: 'llamacpp-upstream' }],
      runtime: { execute },
      localEndpoint: async () => 'http://localhost:1337/v1',
    } as unknown as WorkspaceController,
  }
  return { ctx, execute }
}
it('opens an agent sidebar item at review and verifies before preparing its connection', async () => {
  const { ctx, execute } = fixture()
  await activate('guide-agent:codex', ctx)
  expect(ctx.get().connection).toMatchObject({ step: 'review', agent: 'codex', model: 'local-model' })
  expect(execute).not.toHaveBeenCalled()
  await activate('guide-configure', ctx)
  expect(ctx.get().connection).toMatchObject({
    step: 'done',
    command: 'atc connect codex --model local-model',
  })
  const calls = execute.mock.calls.map(([name]) => name)
  expect(calls.indexOf('models.load')).toBeLessThan(calls.indexOf('api.start'))
  expect(calls.indexOf('setup.complete')).toBeLessThan(calls.indexOf('connection.profile'))
  await activate('guide-copy', ctx)
  expect(ctx.copy).toHaveBeenCalledWith('atc connect codex --model local-model')
})
it('returns failed inference to review without a success state or agent command', async () => {
  const { ctx, execute } = fixture(true)
  await activate('guide-agent:codex', ctx)
  await activate('guide-configure', ctx)
  expect(ctx.get().connection).toMatchObject({ step: 'review', error: 'Inference failed', command: '' })
  expect(execute.mock.calls.map(([name]) => name)).not.toContain('connection.profile')
})
it('supports endpoint Back, port editing, and rejects invalid ports before changing the server', async () => {
  const { ctx, execute } = fixture()
  await activate('guide-open', ctx)
  await activate('guide-path:endpoint', ctx)
  await activate('guide-port', ctx)
  ctx.update((s) => ({ ...s, editValue: '70000' }))
  await activate('save-edit', ctx)
  await activate('guide-next', ctx)
  await activate('guide-configure', ctx)
  expect(ctx.get().connection?.error).toContain('1 to 65535')
  expect(execute).not.toHaveBeenCalled()
  await activate('guide-back', ctx)
  expect(ctx.get().connection?.step).toBe('endpoint')
})
it('renders the same connection actions at compact and wide terminal sizes, with hints', async () => {
  const { ctx } = fixture()
  await activate('guide-open', ctx)
  for (const [w, h] of [
    [54, 24],
    [120, 36],
  ]) {
    const frame = workspaceFrame(ctx.get(), w!, h!, 0)
    expect(frame.targets.map((t) => t.id)).toEqual(
      expect.arrayContaining(['guide-path:agent', 'guide-path:endpoint', 'guide-manual', 'guide-close'])
    )
    for (const t of frame.targets) {
      expect(t.x + t.width).toBeLessThanOrEqual(w!)
      expect(t.y + t.height).toBeLessThanOrEqual(h!)
      expect(t.hint).not.toBe('')
    }
  }
})
it('shows contextual server menus and agent setup links in the terminal sidebar', () => {
  const frame = workspaceFrame({ ...createWorkspace('server'), setupComplete: true }, 120, 36, 0)
  for (const item of SERVER_SIDEBAR)
    expect(frame.targets.some((t) => t.id === `server-section:${item.id}` && t.x >= 9 && t.x < 33)).toBe(true)
  expect(frame.targets.some((t) => t.id === 'sidebar-agent:1')).toBe(true)
})
it('keeps Back and Skip actions in the same first-run stages and never includes chat', () => {
  for (const step of FIRST_RUN_STEPS.filter((s) => s !== 'model')) {
    const frame = workspaceFrame({ ...createWorkspace('welcome'), firstRun: step }, 80, 30, 0)
    expect(frame.targets.some((t) => t.id === 'first-skip')).toBe(true)
    expect(frame.targets.some((t) => t.id === 'first-back')).toBe(true)
    if (step === 'cloud' || step === 'media') {
      expect(frame.targets.map((t) => t.id)).toEqual(expect.arrayContaining(['first-next']))
    }
    expect(frame.targets.some((t) => t.id === 'page:chat')).toBe(false)
  }
})
it('skips optional setup forward without returning to the previous step', async () => {
  const { ctx } = fixture()
  ctx.update((s) => ({ ...s, firstRun: 'cloud', page: 'welcome' }))
  await activate('first-skip-step', ctx)
  expect(ctx.get()).toMatchObject({ firstRun: 'media', page: 'welcome' })
})

it('opens Overview from the explicit manual setup action', async () => {
  const { ctx } = fixture()
  await activate('guide-open', ctx)
  await activate('guide-manual', ctx)
  expect(ctx.get()).toMatchObject({ page: 'server', serverView: 'overview', overlay: null, connection: null })
})

it('keeps terminal launch reachable from review and completion at every supported width', async () => {
  const { ctx } = fixture()
  await activate('guide-agent:codex', ctx)
  ctx.update((s) => ({ ...s, workspace: { api: { running: true } } as never }))
  for (const step of ['review', 'done'] as const) {
    ctx.update((s) => ({ ...s, connection: { ...s.connection!, step } }))
    for (const width of [54, 80, 120]) {
      const frame = workspaceFrame(ctx.get(), width, 24, 0)
      const launch = frame.targets.find((t) => t.id === 'agent:codex')!
      expect(launch).toBeDefined()
      expect(hit(frame, launch.x, launch.y)?.id).toBe('agent:codex')
      expect(launch.x + launch.width).toBeLessThanOrEqual(width)
    }
  }
  ctx.update((s) => ({ ...s, workspace: { api: { running: false } } as never }))
  expect(workspaceFrame(ctx.get(), 54, 24, 0).targets.some((t) => t.id === 'agent:codex')).toBe(false)
})

it('does not reopen onboarding after a late model read when another client finishes setup', async () => {
  const { ctx } = fixture()
  let finish!: (models: unknown[]) => void
  ctx.controller.installed = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  ) as WorkspaceController['installed']
  ctx.update((s) => ({ ...s, firstRun: 'connect', page: 'welcome', setupComplete: false }))
  const opening = activate('guide-open', ctx)
  await vi.waitFor(() => expect(finish).toBeDefined())
  ctx.update((s) => ({ ...s, firstRun: null, page: 'server', setupComplete: true, overlay: null }))
  finish([])
  await opening
  expect(ctx.get()).toMatchObject({ page: 'server', overlay: null, firstRun: null })
})

it('keeps its own configured agent command visible after publishing completion while profile preparation waits', async () => {
  const { ctx, execute } = fixture()
  const original = execute.getMockImplementation()!
  let finish!: (value: { launch_command: string }) => void
  execute.mockImplementation(async (name: string) => {
    if (name === 'setup.complete') {
      ctx.update((s) =>
        applyWorkspaceSnapshot(
          s,
          {
            setup: { complete: true, mode: 'guided', updated_at: 2 },
            setups: [],
            downloads: [],
            keys: [],
          } as unknown as WorkspaceSnapshot,
          2
        )
      )
      return {}
    }
    if (name === 'connection.profile')
      return new Promise((resolve) => {
        finish = resolve
      })
    return original(name)
  })
  ctx.update((s) => ({ ...s, page: 'welcome', firstRun: 'connect', setupComplete: false }))
  await activate('guide-agent:codex', ctx)
  const configuring = activate('guide-configure', ctx)
  await vi.waitFor(() => expect(finish).toBeDefined())
  expect(ctx.get()).toMatchObject({
    firstRun: 'connect',
    overlay: 'connection-guide',
    connection: { step: 'preparing' },
  })
  finish({ launch_command: 'atc connect codex --model local-model' })
  await configuring
  expect(ctx.get()).toMatchObject({
    overlay: 'connection-guide',
    connection: { step: 'done', command: 'atc connect codex --model local-model' },
  })
})
