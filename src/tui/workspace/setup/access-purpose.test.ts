import { expect, it, vi } from 'vitest'
import { activate, type ActionContext } from '../actions.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceController } from '../controller.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { hit } from '../draw/canvas.js'
import { newSetup } from '../../../terminal-setup/index.js'
import { setupAction } from './setup-actions.js'

function fixture() {
  let s = {
    ...createWorkspace('welcome'),
    firstRun: 'permissions' as ReturnType<typeof createWorkspace>['firstRun'],
  }
  const execute = vi.fn(async () => ({})),
    openAdmin = vi.fn(async () => {})
  const ctx: ActionContext = {
    get: () => s,
    update: (fn) => {
      s = fn(s)
    },
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
    controller: { runtime: { execute, openAdmin }, loadModel: vi.fn() } as unknown as WorkspaceController,
  }
  return { ctx, execute, openAdmin, action: (id: string) => activate(id, ctx) }
}
const shown = (s: ReturnType<typeof createWorkspace>) =>
  workspaceFrame(s, 80, 24, 0)
    .cells.map((r) => r.map((c) => c.char).join(''))
    .join('\n')

it('shows permission details, opens the real web admin, and never invents granted permissions', async () => {
  const t = fixture()
  expect(shown(t.ctx.get())).toContain('Notifications')
  expect(shown(t.ctx.get())).toContain('Microphone')
  await t.action('first-permission:notifications')
  expect(shown(t.ctx.get())).toContain('Allow notifications for Web?')
  expect(shown(t.ctx.get())).toContain('browser permission')
  await t.action('first-permission-web')
  expect(t.openAdmin).toHaveBeenCalledOnce()
  expect(t.execute).not.toHaveBeenCalled()
  const back = workspaceInput(
    '',
    { escape: true } as never,
    t.ctx.get(),
    workspaceFrame(t.ctx.get(), 80, 24, 0)
  )
  await t.action(back.action!)
  expect(t.ctx.get()).toMatchObject({
    firstRun: 'permissions',
    overlay: null,
    focus: 'first-permission:notifications',
  })
  expect(shown(t.ctx.get())).not.toContain('Allowed')
})

it('continues and skips terminal permissions without an irrelevant confirmation', async () => {
  const t = fixture()
  expect(shown(t.ctx.get())).toContain('Allow for Web')
  await t.action('first-next')
  expect(t.ctx.get()).toMatchObject({ firstRun: 'cloud', overlay: null })
  expect(shown(t.ctx.get())).not.toContain('Continue without permissions?')
  t.ctx.update((s) => ({ ...s, firstRun: 'permissions' }))
  await t.action('first-skip')
  expect(t.execute).toHaveBeenCalledWith('setup.manual')
  expect(t.ctx.get()).toMatchObject({ firstRun: null, page: 'server', setupComplete: true })
})

it('passes from media directly to server destination cards without opening the connection wizard', async () => {
  const t = fixture()
  t.ctx.update((s) => ({ ...s, firstRun: 'media' }))
  await t.action('first-next')
  expect(shown(t.ctx.get())).not.toContain('Everyday use')
  expect(shown(t.ctx.get())).toContain('How will you use Atomic Server?')
  expect(t.ctx.get()).toMatchObject({ firstRun: 'connect', overlay: null, connection: null })
  const frame = workspaceFrame(t.ctx.get(), 80, 24, 0)
  expect(frame.targets.filter((target) => target.id.startsWith('first-connect:'))).toHaveLength(2)
  await t.action('first-connect:endpoint')
  expect(t.ctx.get()).toMatchObject({
    firstRun: null,
    page: 'server',
    serverView: 'configuration',
    overlay: null,
  })
})

it.each([
  [54, 24],
  [80, 24],
  [120, 36],
])('keeps destination and permission controls distinct with an active download at %i×%i', (width, height) => {
  const t = fixture()
  t.ctx.update((s) => ({
    ...s,
    workspace: {
      setups: [{ id: 'model', stage: 'downloading', plan: { model_id: 'Qwen', total_download_bytes: 100 } }],
      downloads: [],
    } as never,
  }))
  for (const step of ['permissions', 'connect'] as const) {
    t.ctx.update((s) => ({ ...s, firstRun: step }))
    const frame = workspaceFrame(t.ctx.get(), width, height, 0)
    for (const target of frame.targets) {
      expect(target.y + target.height).toBeLessThanOrEqual(height)
      expect(hit(frame, target.x, target.y)?.id, target.id).toBe(target.id)
    }
  }
})

it('keeps the current settings page and draft when a first model finishes in the background', async () => {
  const t = fixture()
  t.ctx.update((s) => ({
    ...s,
    page: 'server',
    firstRun: null,
    setupComplete: true,
    serverView: 'configuration',
    focus: 'server-host',
    configDraft: { 'api.port': '3002' },
    setup: { ...newSetup('server'), stage: 'ready', destination: 'server' },
  }))
  Object.assign(t.ctx.controller, {
    setup: {
      finish: async () => ({
        engine: { provider: 'llamacpp-upstream', version: 'v1', backend: 'cpu' },
        selections: [{ plan: { model_id: 'ready-model' } }],
      }),
    },
    engineSelection: { remember: vi.fn() },
    api: vi.fn(async () => {}),
    localEndpoint: async () => 'http://127.0.0.1:1337/v1',
    save: vi.fn(),
  })
  await setupAction('setup-finish', t.ctx)
  expect(t.ctx.get()).toMatchObject({
    page: 'server',
    serverView: 'configuration',
    focus: 'server-host',
    configDraft: { 'api.port': '3002' },
    model: 'ready-model',
    setup: null,
  })
})
