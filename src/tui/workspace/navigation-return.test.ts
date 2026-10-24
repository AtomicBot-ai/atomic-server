import { expect, it, vi } from 'vitest'
import { activate } from './actions.js'
import { escapeAction } from './escape-action.js'
import { createWorkspace } from './state.js'
import type { ActionContext } from './action-types.js'
import type { WorkspaceController } from './controller.js'

function fixture() {
  let state = { ...createWorkspace('models'), setupComplete: true }
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: {
      installed: async () => [],
      runtime: { execute: vi.fn(async () => ({})) },
    } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  return ctx
}
it('returns Settings to its originating model view and never opens a section popup', async () => {
  const ctx = fixture()
  ctx.update((s) => ({ ...s, libraryView: 'downloads', focus: 'download:0', scroll: 3 }))
  await activate('page:access', ctx)
  await activate('settings-section:assistants', ctx)
  expect(escapeAction(ctx.get())).toEqual({ id: 'settings-back', label: 'Back' })
  await activate(escapeAction(ctx.get()).id, ctx)
  expect(ctx.get()).toMatchObject({
    page: 'models',
    libraryView: 'downloads',
    focus: 'download:0',
    scroll: 3,
    overlay: null,
  })
})
it('closes an inner settings picker first, then returns from Settings', async () => {
  const ctx = fixture()
  await activate('page:access', ctx)
  ctx.update((s) => ({ ...s, overlay: 'sections' }))
  expect(escapeAction(ctx.get()).id).toBe('close')
  await activate('close', ctx)
  expect(ctx.get().page).toBe('access')
  await activate(escapeAction(ctx.get()).id, ctx)
  expect(ctx.get()).toMatchObject({ page: 'models', overlay: null })
})
it.each(['review', 'agent', 'choose'] as const)(
  'Escape closes an existing-server guide at %s and restores its origin',
  async (step) => {
    const ctx = fixture()
    ctx.update((s) => ({ ...s, page: 'server', serverView: 'remote', focus: 'remote-toggle', scroll: 2 }))
    await activate('guide-agent:codex', ctx)
    ctx.update((s) => ({ ...s, connection: { ...s.connection!, step } }))
    expect(escapeAction(ctx.get()).id).toBe('guide-close')
    await activate('guide-close', ctx)
    expect(ctx.get()).toMatchObject({
      page: 'server',
      serverView: 'remote',
      focus: 'remote-toggle',
      scroll: 2,
      connection: null,
      overlay: null,
    })
  }
)
it('retains step back during onboarding and consumes Escape while preparing', async () => {
  const ctx = fixture()
  ctx.update((s) => ({ ...s, firstRun: 'connect', setupComplete: false }))
  await activate('guide-agent:codex', ctx)
  expect(escapeAction(ctx.get()).id).toBe('guide-back')
  ctx.update((s) => ({ ...s, connection: { ...s.connection!, step: 'preparing' } }))
  expect(escapeAction(ctx.get()).id).toBe('')
})
