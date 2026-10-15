import { expect, it, vi } from 'vitest'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
it('reviews a selected media catalog model before starting a daemon-owned installation', async () => {
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
  expect(execute).toHaveBeenLastCalledWith('artifacts.plan', { category: 'image', model_id: 'flux' })
  expect(state.overlay).toBe('install-review')
  expect(execute.mock.calls.some(([name]) => name === 'artifacts.install')).toBe(false)
  await activate('library-install', ctx)
  expect(execute).toHaveBeenLastCalledWith('artifacts.install', {
    plan_digest: 'review-digest',
    request_id: expect.stringMatching(/^terminal-/),
  })
  expect(state).toMatchObject({ libraryView: 'downloads', overlay: null, busy: false })
})

it('renders and activates the same filtered download row without exposing completed jobs', async () => {
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
    controller: {} as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  const frame = workspaceFrame(state, 80, 24, 0)
  expect(frame.targets.filter((v) => v.id.startsWith('download-row:')).map((v) => v.id)).toEqual([
    'download-row:0',
    'download-row:1',
    'download-row:2',
  ])
  expect(frame.cells.map((v) => v.map((c) => c.char).join('')).join('\n')).not.toContain('Finished')
  await activate('download-row:0', ctx)
  expect(state).toMatchObject({ operation: 'setup.resume', operationInput: '{"setup_id":"pending-text"}' })
  state.page = 'models'
  await activate('download-row:1', ctx)
  expect(state).toMatchObject({ operation: 'artifacts.resume', operationInput: '{"id":"paused-media"}' })
  state.page = 'models'
  await activate('download-row:2', ctx)
  expect(state).toMatchObject({ operation: '', toolGroup: 'download' })
  expect(workspaceFrame(state, 80, 24, 0).targets.some((v) => v.id === 'operation-run')).toBe(false)
  state.page = 'models'
  state.focus = 'download-row:1'
  const next = workspaceInput('', { downArrow: true } as never, state, frame)
  expect(next.patch).toMatchObject({ selected: 2, focus: 'download-row:2' })
  await activate('scroll-down', ctx)
  expect(state.selected).toBe(2)
})
