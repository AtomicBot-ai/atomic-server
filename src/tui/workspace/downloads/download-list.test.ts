import { expect, it, vi } from 'vitest'
import type { Key } from 'ink'
import { activate, type ActionContext } from '../actions.js'
import { createWorkspace, type WorkspaceState } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'

function fixture(count = 2) {
  let state: WorkspaceState = {
    ...createWorkspace('welcome'),
    firstRun: 'permissions',
    focus: 'download-more',
    selected: 4,
    workspace: {
      setups: Array.from({ length: count }, (_, i) => ({
        id: `job-${i}`,
        stage: 'downloading_model',
        plan: { model_id: `Local model ${i}`, total_download_bytes: 100 },
      })),
      downloads: [
        {
          id: 'engine',
          kind: 'engine',
          name: 'llama.cpp',
          stage: 'downloading',
          total: 100,
          transferred: 50,
        },
      ],
    } as never,
  }
  const ctx = {
    get: () => state,
    update: (fn: (s: WorkspaceState) => WorkspaceState) => {
      state = fn(state)
    },
    controller: { runtime: { snapshot: async () => state.workspace, execute: vi.fn(async () => ({})) } },
  } as unknown as ActionContext
  async function input(value: string, key: Partial<Key> = {}, width = 80, height = 24) {
    const result = workspaceInput(value, key as Key, state, workspaceFrame(state, width, height, 0))
    if (result.patch) ctx.update((s) => ({ ...s, ...result.patch }))
    if (result.action) await activate(result.action, ctx)
  }
  return { ctx, input }
}

it.each(['download-more', 'first-downloads'])(
  'opens %s over onboarding and closes without navigating',
  async (id) => {
    const { ctx, input } = fixture()
    await activate(id, ctx)
    expect(ctx.get()).toMatchObject({
      page: 'welcome',
      firstRun: 'permissions',
      setupComplete: false,
      overlay: 'download-list',
    })
    const c = workspaceFrame(ctx.get(), 120, 40, 0)
    const text = c.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
    expect(text).toContain('Local model 0')
    expect(text).toContain('Local model 1')
    expect(text).toContain('llama.cpp')
    expect(c.targets.some((t) => t.id.startsWith('page:'))).toBe(false)
    await input('', { escape: true })
    expect(ctx.get()).toMatchObject({
      page: 'welcome',
      firstRun: 'permissions',
      overlay: null,
      selected: 4,
      focus: 'download-more',
    })
    await activate(id, ctx)
    await input('\u001b[<0;1;1M')
    expect(ctx.get()).toMatchObject({ page: 'welcome', firstRun: 'permissions', overlay: null })
  }
)

it('returns nested controls to the list, then to the original connection review', async () => {
  const { ctx } = fixture()
  ctx.update((s) => ({ ...s, firstRun: 'connect', overlay: 'connection-guide', focus: 'guide-model' }))
  await activate('download-more', ctx)
  await activate('download-row:0', ctx)
  expect(ctx.get().overlay).toBe('download-detail')
  await activate('close', ctx)
  expect(ctx.get().overlay).toBe('download-list')
  await activate('download-remove:setup:job-0', ctx)
  await activate('close', ctx)
  expect(ctx.get().overlay).toBe('download-list')
  await activate('close', ctx)
  expect(ctx.get()).toMatchObject({ overlay: 'connection-guide', focus: 'guide-model', firstRun: 'connect' })
})

it.each([
  [60, 20],
  [80, 24],
  [90, 32],
  [100, 30],
  [120, 40],
  [160, 50],
])('scrolls all downloads at %ix%i with keys and mouse', async (width, height) => {
  const { ctx, input } = fixture(12)
  await activate('download-more', ctx)
  for (let i = 0; i < 12; i++) await input('', { downArrow: true }, width, height)
  const c = workspaceFrame(ctx.get(), width, height, 0)
  expect(c.targets.some((t) => t.id === 'download-row:12')).toBe(true)
  for (const t of c.targets.filter((t) => t.y < height - 2)) {
    expect(t.x).toBeGreaterThanOrEqual(c.popover!.x)
    expect(t.x + t.width).toBeLessThanOrEqual(c.popover!.x + c.popover!.width)
    expect(t.y + t.height).toBeLessThanOrEqual(c.popover!.y + c.popover!.height)
  }
  await input('\u001b[<64;20;10M', {}, width, height)
  expect(ctx.get().focus).toBe('download-row:11')
})
