import { expect, it, vi } from 'vitest'
import { activate, type ActionContext } from '../actions.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceController } from '../controller.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { cloudChoices } from '../library/cloud-catalog.js'
import { COLORS, hit } from '../draw/canvas.js'

function fixture() {
  let s = createWorkspace('welcome')
  s.firstRun = 'cloud'
  const execute = vi.fn(async (_name: string, _input?: unknown) => ({ providers: [] }))
  const ctx: ActionContext = {
    get: () => s,
    update: (fn) => {
      s = fn(s)
    },
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
    controller: { runtime: { execute } } as unknown as WorkspaceController,
  }
  const action = (id: string) => activate(id, ctx)
  const input = async (value: string, key: object = {}) => {
    const result = workspaceInput(value, key as never, s, workspaceFrame(s, 80, 24, 0))
    if (result.patch) ctx.update((s) => ({ ...s, ...result.patch }))
    if (result.action) await action(result.action)
  }
  return { ctx, execute, action, input }
}
const shown = (s: ReturnType<typeof createWorkspace>) =>
  workspaceFrame(s, 80, 24, 0)
    .cells.map((r) => r.map((c) => c.char).join(''))
    .join('\n')

it('defaults to OpenRouter and edits provider keys inline, with Escape returning to permissions', async () => {
  const t = fixture()
  await t.action('cloud-refresh')
  expect(t.ctx.get()).toMatchObject({ overlay: null, cloud: { provider: 'openrouter', editing: true } })
  await t.action('cloud-key')
  await t.input('secret-key')
  expect(t.ctx.get().cloud.key).toBe('secret-key')
  expect(shown(t.ctx.get())).not.toContain('secret-key')
  expect(t.ctx.get().overlay).toBeNull()
  await t.input('', { escape: true })
  expect(t.ctx.get()).toMatchObject({ firstRun: 'permissions', overlay: null })
})

it('does not replace a provider choice or key entered while the provider list refreshes', async () => {
  const t = fixture()
  let finish!: () => void
  t.execute.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      finish = resolve
    })
    return { providers: [] }
  })
  const pending = t.action('cloud-refresh')
  await vi.waitFor(() => expect(finish).toBeDefined())
  await t.action('cloud-choice:1')
  await t.action('cloud-key')
  await t.input('typed-while-refreshing')
  finish()
  await pending
  expect(t.ctx.get()).toMatchObject({
    focus: 'cloud-key',
    overlay: null,
    cloud: { provider: 'anthropic', key: 'typed-while-refreshing' },
  })
})

it('shows checking, marks a connected provider, and selects the next unconnected provider inline', async () => {
  const t = fixture()
  await t.action('cloud-refresh')
  await t.action('cloud-key')
  await t.input('secret-key')
  let finish!: () => void
  t.execute.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      finish = resolve
    })
    return { providers: [] }
  })
  t.execute.mockResolvedValueOnce({
    providers: [{ provider: 'openrouter', connected: true, has_api_key: true }],
  } as never)
  const connecting = t.action('cloud-save')
  await vi.waitFor(() => expect(t.ctx.get().cloud.checking).toBe(true))
  expect(shown(t.ctx.get())).toContain('Checking')
  finish()
  await connecting
  expect(t.ctx.get()).toMatchObject({
    overlay: null,
    cloud: { provider: 'chatgpt', key: '', checking: false },
  })
  const connected = cloudChoices(t.ctx.get().cloud).findIndex((p) => p.id === 'openrouter')
  t.ctx.update((s) => ({ ...s, selected: connected, focus: `cloud-choice:${connected}` }))
  expect(shown(t.ctx.get())).toContain('Connected')
  await t.action(`cloud-choice:${connected}`)
  expect(t.ctx.get().cloud.provider).toBe('chatgpt')
})

it('requires a cloud key while allowing a custom local endpoint to connect inline without one', async () => {
  const t = fixture()
  await t.action('cloud-refresh')
  await t.action('cloud-save')
  expect(t.execute.mock.calls.some(([name]) => name === 'cloud.connect')).toBe(false)
  expect(t.ctx.get().cloud.error).toBe('Enter an API key.')
  await t.action(`cloud-choice:${cloudChoices(t.ctx.get().cloud).length - 1}`)
  expect(
    workspaceFrame(t.ctx.get(), 54, 24, 0).targets.some((target) => target.id === 'cloud-provider')
  ).toBe(true)
  await t.action('cloud-provider')
  await t.input('local-gateway')
  await t.action('cloud-url')
  await t.input('http://localhost:8080/v1')
  expect(t.ctx.get().overlay).toBeNull()
  await t.action('cloud-save')
  expect(t.execute).toHaveBeenCalledWith('cloud.connect', {
    provider: 'local-gateway',
    base_url: 'http://localhost:8080/v1',
    models: [],
  })
})

it.each([
  [54, 24],
  [80, 24],
  [120, 36],
])('keeps providers and inline fields reachable with downloads at %i×%i', async (width, height) => {
  const t = fixture()
  await t.action('cloud-refresh')
  t.ctx.update((s) => ({
    ...s,
    workspace: {
      setups: [{ id: 'model', stage: 'downloading', plan: { model_id: 'Qwen', total_download_bytes: 100 } }],
      downloads: [],
    } as never,
  }))
  for (const optionsOpen of [false, true]) {
    t.ctx.update((s) => ({ ...s, cloud: { ...s.cloud, optionsOpen } }))
    const frame = workspaceFrame(t.ctx.get(), width, height, 0)
    expect(frame.targets.some((target) => target.id === 'cloud-key')).toBe(true)
    if (optionsOpen) expect(frame.targets.some((target) => target.id === 'cloud-url')).toBe(true)
    for (const target of frame.targets) {
      expect(target.y + target.height, target.id).toBeLessThanOrEqual(height)
      expect(hit(frame, target.x, target.y)?.id, target.id).toBe(target.id)
    }
  }
  t.ctx.update((s) => ({ ...s, focus: 'cloud-choice:0' }))
  const wheel = workspaceInput(
    '\u001b[<65;20;10M',
    {} as never,
    t.ctx.get(),
    workspaceFrame(t.ctx.get(), width, height, 0)
  )
  expect(wheel.patch?.focus).toBe('cloud-choice:1')
})

it('makes the API key a full-height, contrasting input on a roomy terminal', () => {
  const t = fixture()
  t.ctx.update((s) => ({ ...s, focus: 'cloud-key' }))
  const frame = workspaceFrame(t.ctx.get(), 120, 36, 0)
  const field = frame.targets.find((target) => target.id === 'cloud-key')!
  expect(field.height).toBe(3)
  expect(frame.cells[field.y + 1]![field.x + 2]!.background).toBe(COLORS.focus)
  expect(hit(frame, field.x + 2, field.y + 2)?.id).toBe('cloud-key')
})
