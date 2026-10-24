import { expect, it, vi } from 'vitest'
import type { Key } from 'ink'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { serverChoices } from './server-settings.js'
import { CONNECTION_AGENTS } from '../../../contract/index.js'
const engine = { id: 'llamacpp|v1|cpu', provider: 'llamacpp', version: 'v1', backend: 'cpu', installed: true }
const installed = [{ id: 'local', name: 'Local model', provider: 'llamacpp' }]
function fixture() {
  let state = { ...createWorkspace('server'), setupComplete: true, model: 'local' }
  const execute = vi.fn(async () => ({})),
    select = vi.fn(async () => {}),
    load = vi.fn(async () => {})
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    copy: vi.fn(),
    send: vi.fn(),
    cancel: vi.fn(),
    controller: {
      runtime: { execute },
      setup: { catalogs: async () => [] },
      engineSelection: { list: async () => [engine], select },
      installed: async () => installed,
      loadModel: load,
      save: vi.fn(),
      run: vi.fn(),
    } as unknown as WorkspaceController,
  }
  return { ctx, execute, select, load }
}
it('stages engine and model selections, applies once, and stays on Server', async () => {
  const { ctx, select, load } = fixture()
  await activate('server-engine', ctx)
  expect(ctx.get()).toMatchObject({ overlay: 'server-choice', serverView: 'model', page: 'server' })
  await activate('server-choice:0', ctx)
  expect(select).not.toHaveBeenCalled()
  expect(load).not.toHaveBeenCalled()
  await activate('server-model', ctx)
  await activate('server-choice:0', ctx)
  await activate('server-selection-save', ctx)
  expect(select).toHaveBeenCalledExactlyOnceWith(engine)
  expect(load).toHaveBeenCalledExactlyOnceWith('llamacpp', 'local')
  expect(ctx.get()).toMatchObject({
    serverDraft: null,
    page: 'server',
    serverView: 'model',
    model: 'local',
    engine: engine.id,
  })
  await activate('server-selection-save', ctx)
  expect(load).toHaveBeenCalledTimes(1)
})
it('opens Engine & model from sidebar links before showing a field chooser', async () => {
  const { ctx, select, load } = fixture()
  for (const field of ['engine', 'model']) {
    await activate(`server-model-page:${field}`, ctx)
    expect(ctx.get()).toMatchObject({
      page: 'server',
      serverView: 'model',
      overlay: null,
      focus: `server-${field}`,
    })
  }
  expect(select).not.toHaveBeenCalled()
  expect(load).not.toHaveBeenCalled()
})
it('expands activity in place and keeps a language selection local to the request example', async () => {
  const { ctx, execute } = fixture()
  ctx.update((s) => ({
    ...s,
    base: { ...s.base, activity: [{ time: 1, level: 'info', text: 'Model loaded' }] },
  }))
  await activate('server-activity', ctx)
  const frame = workspaceFrame(ctx.get(), 120, 36, 0)
  expect(frame.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')).toContain('Model loaded')
  expect(
    frame.targets.some((target) => target.id === 'server-section:traffic' || target.id === 'page:logs')
  ).toBe(false)
  await activate('server-section:connect', ctx)
  await activate('server-example-language', ctx)
  await activate('operation-choice:1', ctx)
  expect(ctx.get()).toMatchObject({ serverView: 'connect', connectionLanguage: 'python', overlay: null })
  expect(execute).not.toHaveBeenCalled()
})
it('filters incompatible models and discards staged changes without loading', async () => {
  const { ctx, load } = fixture()
  await activate('server-engine', ctx)
  await activate('server-choice:0', ctx)
  ctx.update((s) => ({
    ...s,
    serverChoice: 'model',
    installed: [...installed, { id: 'other', name: 'Other', provider: 'mlx' }],
  }))
  expect(serverChoices(ctx.get()).map((m) => m.id)).toEqual(['local'])
  await activate('server-selection-discard', ctx)
  expect(ctx.get().serverDraft).toBeNull()
  expect(load).not.toHaveBeenCalled()
})
it('stages a host dropdown value and keeps the configuration open', async () => {
  const { ctx, execute } = fixture()
  await activate('server-host', ctx)
  await activate('server-choice:1', ctx)
  expect(ctx.get()).toMatchObject({
    page: 'server',
    serverView: 'configuration',
    configDraft: { 'api.host': '0.0.0.0' },
    overlay: null,
  })
  expect(execute).not.toHaveBeenCalled()
})
it('searches agents inline, lets Tab leave search, and opens the matching guide', async () => {
  const { ctx } = fixture()
  ctx.update((s) => ({ ...s, focus: 'server-search' }))
  const typed = workspaceInput('codex', {} as Key, ctx.get(), workspaceFrame(ctx.get(), 80, 24, 0))
  ctx.update((s) => ({ ...s, ...typed.patch }))
  expect(ctx.get().serverQuery).toBe('codex')
  const tab = workspaceInput('\t', { tab: true } as Key, ctx.get(), workspaceFrame(ctx.get(), 80, 24, 0))
  expect(tab.patch?.serverQuery).toBeUndefined()
  expect(tab.patch?.focus).toBe('server-agent:0')
  await activate('server-agent:0', ctx)
  expect(ctx.get().connection).toMatchObject({ agent: 'codex', step: 'review' })
})
it('scrolls every sidebar agent into view and opens the last one', async () => {
  const { ctx } = fixture()
  ctx.update((s) => ({ ...s, focus: 'sidebar-agent:0' }))
  for (let i = 0; i < CONNECTION_AGENTS.length - 1; i++) {
    const result = workspaceInput(
      '',
      { downArrow: true } as Key,
      ctx.get(),
      workspaceFrame(ctx.get(), 80, 24, 0)
    )
    ctx.update((s) => ({ ...s, ...result.patch }))
    expect(workspaceFrame(ctx.get(), 80, 24, 0).targets.some((t) => t.id === ctx.get().focus)).toBe(true)
  }
  await activate(ctx.get().focus, ctx)
  expect(ctx.get().connection?.agent).toBe('xcode')
})
it('tests inference without changing onboarding or routing away', async () => {
  const { ctx, execute } = fixture()
  ctx.update((s) => ({
    ...s,
    workspace: { api: { running: true }, services: [{ kind: 'chat', model: 'local' }] } as NonNullable<
      typeof s.workspace
    >,
  }))
  await activate('server-test', ctx)
  expect(execute).toHaveBeenCalledWith('chat.complete', {
    request: { model: 'local', messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 8 },
  })
  expect(ctx.get()).toMatchObject({ page: 'server', busy: false, message: 'Model response received.' })
})
it.each([
  [54, 24],
  [80, 24],
  [120, 36],
])('keeps every Server view actionable inside %sx%s', (width, height) => {
  for (const view of ['overview', 'connect', 'configuration', 'model', 'remote', 'proxy']) {
    const state = {
      ...createWorkspace('server'),
      setupComplete: true,
      serverView: view,
      serverAdvanced: true,
      configDraft: { 'api.port': '1338' },
    }
    const frame = workspaceFrame(state, width, height, 0)
    expect(frame.targets.filter((t) => t.id === 'page:server')).toHaveLength(1)
    for (const t of frame.targets) {
      expect(t.x + t.width, `${view}:${t.id}`).toBeLessThanOrEqual(width)
      expect(t.y + t.height, `${view}:${t.id}`).toBeLessThanOrEqual(t.y === height - 1 ? height : height - 3)
    }
  }
})

it('retains the selected engine and pending model when a load fails, then retries in place', async () => {
  const { ctx, select, load } = fixture()
  load.mockRejectedValueOnce(new Error('Out of memory'))
  await activate('server-engine', ctx)
  await activate('server-choice:0', ctx)
  await activate('server-model', ctx)
  await activate('server-choice:0', ctx)
  await expect(activate('server-selection-save', ctx)).rejects.toThrow('Out of memory')
  expect(ctx.get()).toMatchObject({
    page: 'server',
    serverView: 'model',
    engine: engine.id,
    busy: false,
    serverDraft: { engine: engine.id, model: 'local' },
  })
  await activate('server-selection-save', ctx)
  expect(select).toHaveBeenCalledTimes(1)
  expect(load).toHaveBeenCalledTimes(2)
})
