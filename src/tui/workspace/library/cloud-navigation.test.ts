import { expect, it, vi } from 'vitest'
import { activate } from '../actions.js'
import { cloudAction } from './cloud-actions.js'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { COLORS } from '../draw/canvas.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
function fixture(onboarding = false) {
  let state = createWorkspace(onboarding ? 'welcome' : 'models')
  if (onboarding) state.firstRun = 'cloud'
  const ctx = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: {
      runtime: { execute: vi.fn(async () => ({ providers: [] })) },
    } as unknown as WorkspaceController,
  } as ActionContext
  return {
    get: () => state,
    ctx,
    action: (id: string) => cloudAction(id, ctx),
    escape: async () => {
      const result = workspaceInput('', { escape: true } as never, state, workspaceFrame(state, 80, 30, 0))
      if (result.action) await activate(result.action, ctx)
    },
  }
}
it.each([true, false])(
  'closes a provider directly to its originating page (onboarding %s)',
  async (onboarding) => {
    const t = fixture(onboarding)
    if (!onboarding) await t.action('library:cloud')
    expect(t.get().overlay).toBeNull()
    await t.action('cloud-choice:1')
    expect(t.get().cloud.editing).toBe(true)
    await t.action('cloud-key')
    if (onboarding) {
      expect(t.get().overlay).toBeNull()
      await t.escape()
      expect(t.get()).toMatchObject({ firstRun: 'permissions', overlay: null })
      return
    }
    expect(t.get().overlay).toBe('endpoint')
    await t.escape()
    expect(t.get()).toMatchObject({ overlay: 'cloud', cloud: { editing: true } })
    await t.escape()
    expect(t.get()).toMatchObject({
      overlay: null,
      cloud: { editing: false, key: '' },
      focus: 'cloud-choice:1',
    })
    expect(t.get().page).toBe(onboarding ? 'welcome' : 'models')
    if (!onboarding) expect(t.get().libraryView).toBe('cloud')
  }
)
it('closes Custom Endpoint to the endpoint list without an extra provider popup', async () => {
  const t = fixture()
  await t.action('library:endpoint')
  await t.escape()
  expect(t.get()).toMatchObject({ page: 'models', libraryView: 'endpoint', overlay: null })
})
it.each([
  [54, 24],
  [120, 36],
  [180, 56],
])('fits provider fields and sizes the popup to its content at %sx%s', async (w, h) => {
  const t = fixture()
  await t.action('library:cloud')
  await t.action('cloud-choice:0')
  const closed = workspaceFrame(t.get(), w!, h!, 0)
  expect(closed.popover?.height).toBe(11)
  await t.action('cloud-options')
  const open = workspaceFrame(t.get(), w!, h!, 0)
  expect(open.popover?.height).toBe(15)
  expect(
    open.targets
      .filter((target) => target.id.startsWith('cloud-') && target.id !== 'cloud-close')
      .every((target) => target.x >= 0 && target.x + target.width <= w! && target.y + target.height < h! - 2)
  ).toBe(true)
  expect(open.targets.find((target) => target.id === 'cloud-models')!.y).toBeLessThan(
    open.targets.find((target) => target.id === 'cloud-save')!.y
  )
})
it.each([
  [54, 24],
  [120, 36],
])('places the muted Skip setup immediately left of the main action at %sx%s', (w, h) => {
  const t = fixture(true)
  const frame = workspaceFrame(t.get(), w!, h!, 0)
  const skip = frame.targets.find((target) => target.id === 'first-skip')!
  const next = frame.targets.find((target) => target.id === 'first-next')!
  expect(skip.y).toBe(next.y + 1)
  expect(skip.x + skip.width).toBeLessThan(next.x)
  expect(frame.cells[skip.y]![skip.x]!.color).toBe(COLORS.muted)
  expect(frame.targets.filter((target) => target.id === 'first-skip')).toHaveLength(1)
})

it.each([
  [54, 24],
  [120, 36],
])('shows a provider failure only in its active popup at %sx%s', async (width, height) => {
  const t = fixture(true)
  await t.action('cloud-choice:0')
  t.ctx.update((s) => ({ ...s, cloud: { ...s.cloud, error: 'Rejected fixture key.' } }))
  const frame = workspaceFrame(t.get(), width!, height!, 0)
  const rendered = frame.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
  expect(rendered.split('Rejected fixture key.')).toHaveLength(2)
  expect(frame.targets.some((target) => target.id === 'cloud-refresh')).toBe(false)
})
it.each([
  [54, 24],
  [120, 36],
])(
  'keeps inline fields on the onboarding screen without duplicate Cancel at %sx%s',
  async (width, height) => {
    const t = fixture(true)
    await t.action('cloud-choice:0')
    await t.action('cloud-key')
    const frame = workspaceFrame(t.get(), width!, height!, 0)
    expect(frame.targets.some((target) => target.id === 'cloud-key')).toBe(true)
    expect(
      frame.targets.some(
        (target) => target.id === 'save-edit' || target.id === 'close' || target.id === 'cloud-close'
      )
    ).toBe(false)
    expect(frame.targets.filter((target) => target.id === 'first-back')).toHaveLength(1)
  }
)

it('opens saved custom endpoints as a list and keeps the list behind its editor', async () => {
  const t = fixture()
  t.ctx.controller.runtime.execute = vi.fn(async () => ({
    providers: [
      { provider: 'office', base_url: 'https://office.example/v1', connected: true },
      { provider: 'lab', base_url: 'https://lab.example/v1', connected: true },
    ],
  })) as never
  await t.action('library:endpoint')
  expect(t.get()).toMatchObject({ libraryView: 'endpoint', overlay: null })
  const frame = workspaceFrame(t.get(), 100, 40, 0)
  expect(frame.targets.some((target) => target.id === 'cloud-edit:0')).toBe(true)
  expect(frame.targets.some((target) => target.id === 'cloud-edit:1')).toBe(true)
  await t.action('cloud-edit:0')
  await t.escape()
  expect(t.get()).toMatchObject({ libraryView: 'endpoint', overlay: null })
})
