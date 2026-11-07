import { expect, it, vi } from 'vitest'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import { enginePanelModel, panelRefreshKey } from './engine-panel-model.js'
import { refreshVariantEngine, variantEngineAction } from './variant-engine-actions.js'

function deferred() {
  let resolve!: (value?: unknown) => void
  const promise = new Promise<unknown>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function fixture(kind: 'foundry' | 'litert') {
  const pending = deferred()
  const engine = kind === 'litert' ? 'litert-lm' : 'foundry-local'
  const view = { installed: true, build: 'v1/windows', accelerators: [], preparing: false, steps: [] }
  let state: WorkspaceState = {
    ...createWorkspace('models'),
    overlay: 'engine-panel',
    enginePanel: {
      engine,
      kind,
      mode: 'engine',
      busy: false,
      error: '',
      notice: '',
      foundry: null,
      [kind]: { view: { ...view, installed: false }, search: null, plan: null },
    } as never,
  }
  const execute = vi.fn(async (name: string, _input?: unknown) =>
    name === 'engines.install' ? pending.promise : view
  )
  const ctx = {
    get: () => state,
    update: (fn: (s: WorkspaceState) => WorkspaceState) => {
      state = fn(state)
    },
    controller: { runtime: { execute } } as unknown as WorkspaceController,
  }
  return { ctx, execute, pending, engine }
}
it.each(['foundry', 'litert'] as const)(
  'shows %s installation, rejects a second click and clears progress after success',
  async (kind) => {
    const { ctx, execute, pending } = fixture(kind)
    const running = variantEngineAction(`${kind}-install`, ctx)
    const model = enginePanelModel(ctx.get().enginePanel!, null)
    expect(model.lines.map((line) => line.text).join('\n')).toContain('Installing engine')
    expect(model.buttons.map((button) => button.id)).toEqual(['close'])
    await variantEngineAction(`${kind}-install`, ctx)
    await refreshVariantEngine(ctx, 'poll')
    expect(execute.mock.calls.filter(([name]) => name === 'engines.install')).toHaveLength(1)
    expect(ctx.get().enginePanel!.busy).toBe(true)
    pending.resolve()
    await running
    expect(ctx.get().enginePanel).toMatchObject({ busy: false, error: '' })
    expect(
      enginePanelModel(ctx.get().enginePanel!, null)
        .lines.map((line) => line.text)
        .join('\n')
    ).toContain('Installed: v1/windows')
  }
)
it('does not write an old installation result into a newly opened panel', async () => {
  const { ctx, pending } = fixture('litert')
  const running = variantEngineAction('litert-install', ctx)
  const replacement = fixture('foundry').ctx.get().enginePanel
  ctx.update((s) => ({ ...s, enginePanel: replacement }))
  pending.resolve()
  await running
  expect(ctx.get().enginePanel).toEqual(replacement)
})

it('uses only its own download bytes and replaces the progress with a real failure', async () => {
  const { ctx, execute } = fixture('litert')
  let reject!: (error: Error) => void
  execute.mockImplementationOnce(
    async () =>
      new Promise((_resolve, fail) => {
        reject = fail
      })
  )
  const running = variantEngineAction('litert-install', ctx)
  const panel = ctx.get().enginePanel!
  const snapshot = {
    downloads: [
      { taskId: 'another-model', transferred: 100, total: 100 },
      { taskId: panel.installation!.taskId, transferred: 25, total: 100 },
    ],
  } as never
  expect(
    enginePanelModel(panel, snapshot)
      .lines.map((line) => line.text)
      .join('\n')
  ).toContain('Downloading · 25%')
  reject(new Error('Network unavailable'))
  await running
  expect(ctx.get().enginePanel).toMatchObject({
    busy: false,
    installation: null,
    error: 'Network unavailable',
  })
})

it('reattaches the installation loader when its panel is closed and reopened', async () => {
  const { ctx, execute, pending } = fixture('litert')
  const running = variantEngineAction('litert-install', ctx)
  ctx.update((s) => ({ ...s, enginePanel: fixture('litert').ctx.get().enginePanel }))
  await refreshVariantEngine(ctx, 'reopened')
  expect(
    enginePanelModel(ctx.get().enginePanel!, null)
      .lines.map((line) => line.text)
      .join('\n')
  ).toContain('Installing engine')
  await variantEngineAction('litert-install', ctx)
  expect(execute.mock.calls.filter(([name]) => name === 'engines.install')).toHaveLength(1)
  pending.resolve()
  await running
  expect(ctx.get().enginePanel).toMatchObject({ busy: false, installation: null, error: '' })
})

it.each(['foundry', 'litert'] as const)(
  'joins the %s install queued by intro and refreshes after it completes',
  async (kind) => {
    const { ctx, execute, engine } = fixture(kind)
    const job = {
      kind: 'engine',
      engine,
      taskId: 'intro-install',
      id: 'intro-install',
      stage: 'downloading',
      transferred: 40,
      total: 100,
    }
    ctx.update((s) => ({ ...s, workspace: { downloads: [job] } as never }))
    await refreshVariantEngine(ctx, '')
    expect(
      enginePanelModel(ctx.get().enginePanel!, ctx.get().workspace)
        .lines.map((line) => line.text)
        .join('\n')
    ).toContain('Downloading · 40%')
    await variantEngineAction(`${kind}-install`, ctx)
    expect(execute).not.toHaveBeenCalled()
    const panel = ctx.get().enginePanel!
    expect(panelRefreshKey(panel, ctx.get().workspace)).toBe(panel.seen)
    ctx.update((s) => ({ ...s, workspace: { downloads: [{ ...job, stage: 'ready' }] } as never }))
    const key = panelRefreshKey(panel, ctx.get().workspace)
    expect(key).not.toBe(panel.seen)
    await refreshVariantEngine(ctx, key)
    expect(ctx.get().enginePanel).toMatchObject({ busy: false, error: '' })
    expect(
      enginePanelModel(ctx.get().enginePanel!, ctx.get().workspace)
        .lines.map((line) => line.text)
        .join('\n')
    ).toContain('Installed: v1/windows')
  }
)

it('shows the queued installation failure instead of silently returning to Install', async () => {
  const { ctx, engine } = fixture('litert')
  const job = { kind: 'engine', engine, taskId: 'intro-install', stage: 'downloading' }
  ctx.update((s) => ({ ...s, workspace: { downloads: [job] } as never }))
  await refreshVariantEngine(ctx, '')
  ctx.update((s) => ({
    ...s,
    workspace: { downloads: [{ ...job, stage: 'failed', error: 'Download interrupted' }] } as never,
  }))
  await refreshVariantEngine(ctx, panelRefreshKey(ctx.get().enginePanel!, ctx.get().workspace))
  expect(ctx.get().enginePanel?.error).toBe('Download interrupted')
})
