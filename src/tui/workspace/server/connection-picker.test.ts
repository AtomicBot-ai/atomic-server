import { expect, it, vi } from 'vitest'
import { CONNECTION_AGENTS } from '../../../contract/index.js'
import { activate, type ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace, type WorkspaceState } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { hit, COLORS } from '../draw/canvas.js'
import type { Key } from 'ink'
function fixture() {
  const models = Array.from({ length: 24 }, (_, i) => ({
    id: `model/${i}`,
    name: `Local model ${i}`,
    provider: 'llamacpp-upstream',
    providers: ['llamacpp-upstream', 'mlx'],
  }))
  let state: WorkspaceState = { ...createWorkspace('welcome'), firstRun: 'connect' }
  const execute = vi.fn()
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
    controller: { installed: async () => models, runtime: { execute } } as unknown as WorkspaceController,
  }
  const press = async (key: Partial<Key>, width = 54, input = '') => {
    const result = workspaceInput(input, key as Key, state, workspaceFrame(state, width, 24, 0))
    ctx.update((s) => ({ ...s, ...result.patch }))
    if (result.action) await activate(result.action, ctx)
  }
  return { ctx, execute, press }
}
it('selects models and compatible engines in place without changing the agent or starting setup', async () => {
  const { ctx, execute, press } = fixture()
  await activate('guide-agent:codex', ctx)
  await activate('guide-engine', ctx)
  expect(ctx.get().focus).toBe('connection-option:llamacpp-upstream')
  await press({ downArrow: true })
  await press({ return: true })
  expect(ctx.get()).toMatchObject({
    overlay: 'connection-guide',
    focus: 'guide-engine',
    connection: { provider: 'mlx' },
  })
  await activate('guide-model', ctx)
  await press({ downArrow: true })
  await press({ return: true })
  expect(ctx.get()).toMatchObject({
    page: 'welcome',
    firstRun: 'connect',
    overlay: 'connection-guide',
    focus: 'guide-model',
    connection: { step: 'review', agent: 'codex', model: 'model/1', provider: 'mlx' },
  })
  expect(execute).not.toHaveBeenCalled()
  ctx.update((s) => ({ ...s, installed: [...s.installed, { id: 'other', name: 'Other', provider: 'vllm' }] }))
  await activate('guide-model', ctx)
  await press({ end: true })
  await press({ return: true })
  expect(ctx.get().connection).toMatchObject({ model: 'other', provider: 'vllm' })
})
it.each([54, 80, 120])(
  'scrolls long menus, supports mouse choice, and restores the draft on Escape at %s columns',
  async (width) => {
    const { ctx, press } = fixture()
    await activate('guide-agent:codex', ctx)
    const draft = ctx.get().connection
    await activate('guide-model', ctx)
    await press({}, width, '\u001b[<65;20;10M')
    expect(ctx.get().focus).toBe('connection-option:model%2F1')
    await press({ end: true }, width)
    let frame = workspaceFrame(ctx.get(), width, 24, 0)
    const last = frame.targets.find((t) => t.id === 'connection-option:model%2F23')!
    expect(last).toBeDefined()
    expect(hit(frame, last.x, last.y)?.id).toBe(last.id)
    await press({ escape: true }, width)
    expect(ctx.get().connection).toBe(draft)
    expect(ctx.get()).toMatchObject({ overlay: 'connection-guide', focus: 'guide-model' })
    await activate('guide-model', ctx)
    frame = workspaceFrame(ctx.get(), width, 24, 0)
    const target = frame.targets.find((t) => t.id === 'connection-option:model%2F1')!
    await press({}, width, `\u001b[<0;${target.x + 1};${target.y + 1}M`)
    expect(ctx.get().connection?.model).toBe('model/1')
  }
)
it.each([54, 80, 120])(
  'scrolls every agent card with visible focus and preserves More on Back at %s columns',
  async (width) => {
    const { ctx, press } = fixture()
    await activate('guide-open', ctx)
    await activate('guide-path:agent', ctx)
    await activate('guide-more', ctx)
    ctx.update((s) => ({
      ...s,
      focus: 'guide-select:claude',
      workspace: {
        setups: [{ id: 'text', stage: 'downloading', plan: { model_id: 'Text', total_download_bytes: 100 } }],
        downloads: [{ taskId: 'text', transferred: 50, total: 100 }],
        api: { port: 1337 },
      } as never,
    }))
    const seen = new Set<string>()
    for (let i = 0; i < CONNECTION_AGENTS.length + 1; i++) {
      const frame = workspaceFrame(ctx.get(), width, 24, 0)
      const target = frame.targets.find((t) => t.id === ctx.get().focus)!
      expect(target, ctx.get().focus).toBeDefined()
      expect(hit(frame, target.x, target.y)?.id).toBe(target.id)
      expect(target.y + target.height).toBeLessThanOrEqual(20)
      seen.add(target.id)
      await press({ downArrow: true }, width)
    }
    expect(CONNECTION_AGENTS.every((a) => seen.has(`guide-select:${a.id}`))).toBe(true)
    expect(
      workspaceFrame(ctx.get(), width, 24, 0).targets.some((t) => t.id.startsWith('guide-agents-'))
    ).toBe(false)
    await press({ return: true }, width)
    expect(ctx.get().connection).toMatchObject({ agent: 'xcode', step: 'review' })
    await press({ escape: true }, width)
    expect(ctx.get()).toMatchObject({
      connection: { step: 'agent', more: true },
      focus: 'guide-select:xcode',
    })
    await press({}, width, '\u001b[<64;20;10M')
    expect(ctx.get().focus).toBe('guide-select:jetbrains')
  }
)

it.each([
  [54, 24],
  [120, 36],
])(
  'paints every visible model option above the parent and selects an overlapping row at %s×%s',
  async (width, height) => {
    const { ctx } = fixture()
    await activate('guide-agent:codex', ctx)
    const parent = workspaceFrame(ctx.get(), width!, height!, 0)
    await activate('guide-model', ctx)
    const frame = workspaceFrame(ctx.get(), width!, height!, 0)
    const popover = frame.popover!
    const parentBox = parent.popover!
    expect(popover.y).toBeLessThan(parentBox.y + parentBox.height)
    expect(popover.y + popover.height).toBeGreaterThan(parentBox.y)
    const options = frame.targets.filter((t) => t.id.startsWith('connection-option:'))
    expect(options.length).toBeGreaterThan(3)
    for (const option of options) {
      const label = ctx
        .get()
        .installed.find((m) => option.id === `connection-option:${encodeURIComponent(m.id)}`)!.name!
      const row = frame.cells[option.y]!.slice(popover.x + 1, popover.x + popover.width - 1)
        .map((c) => c.char)
        .join('')
      expect(row).toContain(label)
      expect(hit(frame, option.x, option.y)?.id).toBe(option.id)
      expect(frame.cells[option.y]![popover.x]!.char).toBe('|')
      expect(frame.cells[option.y]![popover.x + popover.width - 1]!.char).toBe('|')
    }
    expect(frame.targets.some((t) => t.id === 'guide-configure')).toBe(false)
    expect(frame.cells[popover.y]![popover.x]!.color).toBe(COLORS.gold)
    const chosen = options.find((t) => t.y >= parentBox.y + 3)!
    const result = workspaceInput(`\u001b[<0;${chosen.x + 1};${chosen.y + 1}M`, {} as Key, ctx.get(), frame)
    await activate(result.action!, ctx)
    expect(ctx.get()).toMatchObject({
      overlay: 'connection-guide',
      connection: { model: decodeURIComponent(chosen.id.slice(18)) },
    })
  }
)
it('anchors a short picker below its field and dims the parent action surface', async () => {
  const { ctx } = fixture()
  await activate('guide-agent:codex', ctx)
  ctx.update((s) => ({ ...s, installed: s.installed.slice(0, 2) }))
  const parent = workspaceFrame(ctx.get(), 120, 36, 0)
  const anchor = parent.targets.find((t) => t.id === 'guide-model')!
  const configure = parent.targets.find((t) => t.id === 'guide-configure')!
  await activate('guide-model', ctx)
  const frame = workspaceFrame(ctx.get(), 120, 36, 0)
  expect(frame.popover!.y).toBe(anchor.y + 1)
  expect(frame.cells[configure.y]![configure.x]!.background).not.toBe(COLORS.gold)
})
