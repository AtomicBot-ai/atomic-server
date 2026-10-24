import { expect, it, vi } from 'vitest'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import { workspacePage } from '../navigation.js'
it('leaves the Server model section when the Models navigation item is opened', async () => {
  let state = { ...createWorkspace('models'), setupComplete: true, serverView: 'model' }
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: {
      installed: async () => [],
      models: async () => [],
      runtime: { execute: async () => ({ rows: [] }) },
      setup: { engines: async () => [] },
    } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  expect(workspacePage(state)).toBe('server')
  await activate('page:models', ctx)
  expect(workspacePage(state)).toBe('models')
})

it('starts a selected media download automatically after compatibility checks', async () => {
  let state = { ...createWorkspace('models'), setupComplete: true }
  const execute = vi.fn(async (name: string) =>
    name === 'models.catalog'
      ? { rows: [{ id: 'flux', name: 'Flux', category: 'image', description: 'Image model', source: {} }] }
      : name === 'artifacts.plan'
        ? { digest: 'review-digest', total_download_bytes: 1024, blockers: [] }
        : { id: 'install' }
  )
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: { runtime: { execute, snapshot: async () => null } } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  state.libraryView = 'catalog'
  await activate('category:image', ctx)
  await activate('library-row:0', ctx)
  expect(execute).toHaveBeenCalledWith('artifacts.plan', { category: 'image', model_id: 'flux' })
  expect(execute.mock.calls.filter(([name]) => name === 'artifacts.install')).toHaveLength(1)
  expect(execute).toHaveBeenLastCalledWith('artifacts.install', {
    plan_digest: 'review-digest',
    request_id: expect.stringMatching(/^terminal-/),
  })
  expect(state).toMatchObject({ libraryView: 'downloads', overlay: null, busy: false })
})

it('renders and activates the same filtered download row while retaining completed jobs after active downloads', async () => {
  const { workspaceFrame } = await import('../frame.js')
  const { workspaceInput } = await import('../input.js')
  let state = { ...createWorkspace('models'), setupComplete: true }
  state.libraryView = 'downloads'
  state.workspace = {
    api: { running: false },
    eye: 'offline',
    services: [],
    setups: [
      { id: 'finished-media', stage: 'ready', plan: { category: 'image', name: 'Finished' } },
      { id: 'pending-text', stage: 'failed', plan: { model_id: 'Current' } },
      { id: 'paused-media', stage: 'paused', plan: { category: 'video', name: 'Paused' } },
    ],
    downloads: [
      { taskId: 'finished-transfer', status: 'completed' },
      { taskId: 'loose-transfer', transferred: 2, total: 10 },
    ],
  } as never
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: {
      runtime: { execute: vi.fn(async () => ({})), snapshot: async () => state.workspace },
    } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  const frame = workspaceFrame(state, 100, 40, 0)
  expect(frame.targets.filter((v) => v.id.startsWith('download-row:')).map((v) => v.id)).toEqual([
    'download-row:0',
    'download-row:1',
    'download-row:2',
    'download-row:3',
  ])
  expect(frame.cells.map((v) => v.map((c) => c.char).join('')).join('\n')).toContain('Finished')
  await activate('download-row:0', ctx)
  expect(state.overlay).toBe('download-detail')
  await activate('download-do:resume', ctx)
  expect(ctx.controller.runtime.execute).toHaveBeenCalledWith('setup.resume', { setup_id: 'pending-text' })
  state.page = 'models'
  await activate('download-row:1', ctx)
  await activate('download-do:resume', ctx)
  expect(ctx.controller.runtime.execute).toHaveBeenCalledWith('artifacts.resume', { id: 'paused-media' })
  state.page = 'models'
  await activate('download-row:2', ctx)
  expect(state.overlay).toBe('download-detail')
  expect(workspaceFrame(state, 100, 40, 0).targets.some((v) => v.id === 'operation-run')).toBe(false)
  state.page = 'models'
  state.overlay = null
  state.focus = 'download-row:1'
  const next = workspaceInput('', { downArrow: true } as never, state, frame)
  expect(next.patch).toMatchObject({ selected: 2, focus: 'download-row:2' })
  await activate('scroll-down', ctx)
  expect(state.selected).toBe(3)
})
