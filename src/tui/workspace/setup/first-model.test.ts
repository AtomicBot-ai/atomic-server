import { expect, it, vi } from 'vitest'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { hit, COLORS } from '../draw/canvas.js'
import { newSetup } from '../../../terminal-setup/index.js'
import type { SetupSelection } from '../../../terminal-setup/index.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { firstModelChoices, selectedFirstModel } from './first-model.js'
import { firstRunAction } from './first-run.js'

function fixture() {
  let state = createWorkspace('setup')
  state.setup = {
    ...newSetup('server'),
    stage: 'models',
    engine: 'llamacpp-upstream|b1|cpu',
    device: { name: 'Device CPU', memory: 16384 },
    repositories: Array.from({ length: 12 }, (_, i) => ({
      id: `AtomicChat/model-${i}`,
      title: `Model ${i}`,
      summary: `Model ${i} summary`,
      downloads: 10,
    })),
  }
  const selection = {
    request: { repo: 'AtomicChat/model-2', file: 'model.gguf' },
    requestId: 'download',
    plan: { model_id: 'model-2', provider: 'llamacpp-upstream', engine: null },
  } as SetupSelection
  const begin = vi.fn(async () => ({ manifest: { startedAt: 10 } }))
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: {
      save: vi.fn(async () => {}),
      files: vi.fn(async () => [
        { filename: 'model.gguf', size: 1000, downloadUrl: 'https://example.invalid/model.gguf' },
      ]),
      runtime: { execute: vi.fn(async () => ({})) },
      setup: { plan: vi.fn(async () => selection), begin },
    } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  const input = async (value: string, key: object, width = 80, height = 24) => {
    const result = workspaceInput(value, key as never, state, workspaceFrame(state, width, height, 0))
    if (result.patch) ctx.update((s) => ({ ...s, ...result.patch }))
    if (result.action) await firstRunAction(result.action, ctx)
  }
  return { ctx, begin, input }
}

it('shows a selected model once and keeps Continue available without a repeated footer summary', () => {
  const t = fixture()
  const frame = workspaceFrame(t.ctx.get(), 120, 36, 0)
  const shown = frame.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
  expect(shown.match(/Model 0/g)).toHaveLength(2) // Card title and its description, never the footer.
  expect(shown).not.toContain('Download model')
  expect(frame.targets.find((target) => target.id === 'first-model-continue')).toBeDefined()
  expect(frame.cells[34]!.every((cell) => cell.char === ' ')).toBe(true)
})

it('selects a radio card with the mouse and downloads only after Continue, then opens permissions', async () => {
  const t = fixture()
  t.ctx.update((s) => ({ ...s, focus: 'first-model-choice:2', selected: 2 }))
  const frame = workspaceFrame(t.ctx.get(), 80, 24, 0)
  const card = frame.targets.find((target) => target.id === 'first-model-choice:2')!
  expect(hit(frame, card.x + 2, card.y + 1)?.id).toBe(card.id)
  await t.input(`\u001b[<0;${card.x + 3};${card.y + 2}M`, {})
  expect(selectedFirstModel(t.ctx.get())?.name).toBe('Model 2')
  expect(t.begin).not.toHaveBeenCalled()
  expect(t.ctx.get().setup?.stage).toBe('models')
  await firstRunAction('first-model-continue', t.ctx)
  expect(t.begin).toHaveBeenCalledOnce()
  expect(t.ctx.controller.save).toHaveBeenCalledWith('tui.model', 'model-2')
  expect(t.ctx.get()).toMatchObject({
    firstRun: 'permissions',
    page: 'welcome',
    setup: { stage: 'download' },
  })
})

it('keeps installed models first, excludes their catalog duplicates, and uses them without downloading', async () => {
  const t = fixture()
  t.ctx.update((s) => ({
    ...s,
    installed: [{ id: 'AtomicChat/model-0/Q4.gguf', name: 'Local model', provider: 'llamacpp-upstream' }],
  }))
  const choices = firstModelChoices(t.ctx.get())
  expect(choices[0]).toMatchObject({ name: 'Local model', group: 'On this device', installed: true })
  expect(choices.some((choice) => choice.key === 'catalog:AtomicChat/model-0')).toBe(false)
  await firstRunAction('first-model-continue', t.ctx)
  expect(t.ctx.get()).toMatchObject({
    firstRun: 'permissions',
    model: 'AtomicChat/model-0/Q4.gguf',
    setup: null,
  })
  expect(t.begin).not.toHaveBeenCalled()
  expect(t.ctx.controller.save).toHaveBeenCalledWith('tui.model', 'AtomicChat/model-0/Q4.gguf')
})

it.each(['permissions', 'cloud', 'server'] as const)(
  'keeps %s and its controls in place while an earlier model plan finishes',
  async (destination) => {
    const t = fixture()
    let finish!: () => void
    vi.mocked(t.ctx.controller.files).mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      return [{ filename: 'model.gguf', size: 1000, downloadUrl: 'https://example.invalid/model.gguf' }]
    })
    const preparing = firstRunAction('first-model-continue', t.ctx)
    await vi.waitFor(() => expect(t.ctx.get().setup?.preparing).toBe(true))
    expect(t.ctx.get().firstRun).toBe('permissions')
    if (destination === 'permissions') await firstRunAction('first-permission:notifications', t.ctx)
    else if (destination === 'cloud') t.ctx.update((s) => ({ ...s, firstRun: 'cloud', focus: 'cloud-key' }))
    else {
      await firstRunAction('first-skip', t.ctx)
    }
    const before = t.ctx.get()
    finish()
    await preparing
    expect(t.begin).toHaveBeenCalledOnce()
    expect(t.ctx.get()).toMatchObject({
      firstRun: before.firstRun,
      page: before.page,
      focus: before.focus,
      overlay: before.overlay,
      setup: { stage: 'download', ...(destination === 'server' ? { destination: 'server' } : {}) },
    })
  }
)

it.each([
  [54, 24],
  [80, 24],
  [120, 36],
  [180, 56],
])(
  'scrolls every grouped choice at %i×%i while selection and action bar stay fixed',
  async (width, height) => {
    const t = fixture()
    t.ctx.update((s) => ({
      ...s,
      focus: 'first-model-choice:0',
      installed: Array.from({ length: 4 }, (_, i) => ({
        id: `local-${i}`,
        name: `Local ${i}`,
        provider: 'llamacpp-upstream',
      })),
    }))
    const initial = selectedFirstModel(t.ctx.get())?.key
    const bar = workspaceFrame(t.ctx.get(), width, height, 0).targets.find(
      (target) => target.id === 'first-model-continue'
    )!
    for (let i = 0; i < firstModelChoices(t.ctx.get()).length; i++) {
      if (i) await t.input('', { downArrow: true }, width, height)
      const frame = workspaceFrame(t.ctx.get(), width, height, 0)
      const skip = frame.targets.find((target) => target.id === 'first-skip')!
      expect(skip.y).toBe(bar.y + 1)
      expect(skip.x + skip.width).toBeLessThan(bar.x)
      expect(frame.cells[skip.y]![skip.x]!.color).toBe(COLORS.muted)
      expect(frame.targets.some((target) => target.id === `first-model-choice:${i}`)).toBe(true)
      expect(selectedFirstModel(t.ctx.get())?.key).toBe(initial)
      expect(frame.targets.find((target) => target.id === 'first-model-continue')?.y).toBe(bar.y)
      expect(
        frame.targets.some((target) => /setup-query|setup-engine-back|setup-variants:/.test(target.id))
      ).toBe(false)
      for (const target of frame.targets) {
        expect(target.x + target.width).toBeLessThanOrEqual(width)
        expect(target.y + target.height).toBeLessThanOrEqual(height)
      }
    }
    await t.input('', { home: true }, width, height)
    await t.input('\u001b[<65;20;10M', {}, width, height)
    expect(t.ctx.get().focus).toBe('first-model-choice:1')
    await t.input('', { pageDown: true }, width, height)
    expect(t.ctx.get().focus).toBe('first-model-choice:6')
    expect(selectedFirstModel(t.ctx.get())?.key).toBe(initial)
  }
)

it('keeps grouped choices reachable when a background download reduces the catalog height', async () => {
  const t = fixture()
  t.ctx.update((s) => ({
    ...s,
    focus: 'first-model-choice:0',
    workspace: {
      setups: [
        {
          id: 'background',
          stage: 'downloading',
          plan: { model_id: 'Background model', total_download_bytes: 100 },
        },
      ],
      downloads: [],
    } as never,
  }))
  for (let i = 0; i < 12; i++) {
    if (i) await t.input('', { downArrow: true }, 54, 24)
    expect(
      workspaceFrame(t.ctx.get(), 54, 24, 0).targets.some((target) => target.id === t.ctx.get().focus)
    ).toBe(true)
  }
})
