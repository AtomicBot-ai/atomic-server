import { expect, it, vi } from 'vitest'
import { createWorkspace } from '../state.js'
import { canvas } from '../draw/canvas.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import type { WorkspaceSnapshot } from '../../../contract/index.js'
import { downloadAction, drawDownloadDetail } from './download-detail.js'
import { libraryRows } from './library-model.js'
import { withEngineBuilds } from './engine-builds.js'
it('names engine download details and retries failed engine jobs without unsupported model controls', async () => {
  let state = createWorkspace('models')
  state.libraryView = 'downloads'
  state.workspace = {
    setups: [],
    downloads: [
      {
        id: 'engine',
        taskId: 'engine',
        kind: 'engine',
        name: 'Atomic Prism',
        stage: 'failed',
        error: 'Network unavailable',
      },
    ],
  } as unknown as WorkspaceSnapshot
  const execute = vi.fn()
  const ctx = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: {
      runtime: { execute, snapshot: async () => state.workspace },
    } as unknown as WorkspaceController,
  } as ActionContext
  await downloadAction('download-row:0', ctx)
  expect(state.downloadSelection?.name).toBe('Atomic Prism')
  const view = canvas(100, 32)
  drawDownloadDetail(view, state, state.focus)
  expect(view.targets.map((t) => t.id)).toContain('download-do:retry')
  expect(view.targets.some((t) => /pause|remove/.test(t.id))).toBe(false)
  await downloadAction('download-do:retry', ctx)
  expect(execute).toHaveBeenCalledWith('engines.retry', { id: 'engine' })
})
it('uses installed status only when core reports an active or installed build', () => {
  expect(
    libraryRows(
      {
        engines: [
          { engine: 'llamacpp-upstream', active: { version: 'b1', variant: 'cpu' } },
          { engine: 'atomic-prism', builds: [{ version: 'p1' }] },
          { engine: 'llamacpp' },
        ],
      },
      'engines'
    ).map((row) => row.description)
  ).toEqual(['Installed · b1 · cpu', 'Installed', 'Not installed'])
})

it('refreshes a completed engine build without replacing unsaved settings or the open dialog', () => {
  const state = createWorkspace('models')
  state.enginePanel = {
    engine: 'atomic-prism',
    kind: 'build',
    mode: 'engine',
    busy: false,
    seen: '',
    summary: 'Not installed',
    builds: [],
  } as unknown as typeof state.enginePanel
  const next = withEngineBuilds(state, 'atomic-prism', {
    active: { version: 'b2' },
    builds: [{ version: 'b2', variant: 'cpu', active: true }],
  })
  expect(next.enginePanel).toMatchObject({ summary: 'b2', builds: [{ version: 'b2', active: true }] })
  expect(withEngineBuilds(state, 'llamacpp', {})).toBe(state)
})
