import { expect, it, vi } from 'vitest'
import type { WorkspaceController } from '../controller.js'
import type { ActionContext } from '../actions.js'
import { createWorkspace } from '../state.js'
import { canvas } from '../draw/canvas.js'
import { engineAction } from './engine-actions.js'
import { withEngineBuilds } from './engine-builds.js'
import { enginePanelModel } from './engine-panel-model.js'
import { drawEnginePanel } from './engine-panel.js'
import type { EnginePanel } from './engine-panel-model.js'

const entry = {
  engine: 'llamacpp-upstream',
  active: { version: 'b1', variant: 'cpu' },
  latest: { version: 'b2', variant: 'cpu' },
  update: { needed: false, target: null },
  builds: [],
}
function fixture() {
  const panel: EnginePanel = {
    engine: entry.engine,
    kind: 'build',
    summary: 'b1',
    mode: 'engine',
    form: null,
    foundry: null,
    state: null,
    busy: false,
    error: '',
    notice: '',
    removing: false,
    keepModels: false,
    launch: 'terminal',
    seen: '',
  }
  let state = withEngineBuilds(
    { ...createWorkspace('models'), overlay: 'engine-panel', enginePanel: panel },
    entry.engine,
    entry
  )
  const execute = vi.fn(async (_name: string, _input?: Record<string, unknown>): Promise<unknown> => ({
    engines: [entry],
  }))
  const ctx: Pick<ActionContext, 'get' | 'update' | 'controller'> = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: { runtime: { execute } } as unknown as WorkspaceController,
  }
  return { ctx, execute, get: () => state, model: () => enginePanelModel(state.enginePanel!, null) }
}

it('shows checking, prevents repeated checks and gates installation on an offered update', async () => {
  const t = fixture()
  expect(t.model().buttons.map((b) => b.id)).not.toContain('engine-install')
  let finish!: (value: unknown) => void
  t.execute.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const pending = engineAction('engine-refresh', t.ctx)
  await vi.waitFor(() => expect(t.get().enginePanel?.updateCheck?.phase).toBe('checking'))
  expect(t.model().buttons.find((b) => b.id === 'engine-refresh')?.label).toBe('Checking…')
  await engineAction('engine-refresh', t.ctx)
  expect(t.execute).toHaveBeenCalledTimes(1)
  finish({ engines: [{ ...entry, update: { needed: true, target: entry.latest } }] })
  await pending
  expect(t.model().buttons.map((b) => b.label)).toContain('Install latest build')
  expect(t.model().buttons.map((b) => b.id)).not.toContain('engine-refresh')
  await engineAction('engine-install', t.ctx)
  expect(t.execute).toHaveBeenCalledWith('engines.enqueue', { engine: entry.engine })
})

it('shows current, error and successful recheck feedback without using stale cached offers', async () => {
  const t = fixture()
  await engineAction('engine-refresh', t.ctx)
  expect(t.get().enginePanel?.updateCheck).toMatchObject({ phase: 'current' })
  t.execute.mockRejectedValueOnce(new Error('Offline'))
  await engineAction('engine-refresh', t.ctx)
  expect(t.get().enginePanel?.updateCheck).toMatchObject({
    phase: 'error',
    message: expect.stringContaining('Offline'),
  })
  t.execute.mockResolvedValueOnce({ engines: [{ ...entry, source_error: 'Network unavailable' }] })
  await engineAction('engine-refresh', t.ctx)
  expect(t.get().enginePanel?.updateCheck?.phase).toBe('error')
  await engineAction('engine-refresh', t.ctx)
  expect(t.get().enginePanel?.updateCheck?.phase).toBe('current')
  await engineAction('engine-install', t.ctx)
  expect(t.execute.mock.calls.some(([name]) => name === 'engines.enqueue')).toBe(false)
})

it.each([
  [54, 20],
  [54, 24],
  [120, 36],
])('shows Save only for changed settings and equal-height actions at %ix%i', (width, height) => {
  const t = fixture()
  const form = {
    descriptors: [],
    values: { context: 2048, args: ['a'] },
    draft: { args: ['a'] },
    revision: 1,
    gpus: [],
  }
  t.ctx.update((s) => ({ ...s, enginePanel: { ...s.enginePanel!, form } }))
  expect(t.model().buttons.map((b) => b.id)).not.toContain('engine-settings-save')
  t.ctx.update((s) => ({
    ...s,
    enginePanel: { ...s.enginePanel!, form: { ...form, draft: { context: 4096 } } },
  }))
  expect(t.model().buttons.map((b) => b.id)).toContain('engine-settings-save')
  const c = canvas(width, height)
  drawEnginePanel(c, t.get(), 'engine-settings-save')
  for (const id of ['engine-refresh', 'engine-settings-save', 'close']) {
    const target = c.targets.find((t) => t.id === id)!
    expect(target.height).toBe(3)
    expect(target.y + target.height).toBeLessThanOrEqual(height)
    expect(target.x + target.width).toBeLessThanOrEqual(width)
  }
  t.ctx.update((s) => ({
    ...s,
    enginePanel: { ...s.enginePanel!, form: { ...form, draft: { context: 2048 } } },
  }))
  expect(t.model().buttons.map((b) => b.id)).not.toContain('engine-settings-save')
})
