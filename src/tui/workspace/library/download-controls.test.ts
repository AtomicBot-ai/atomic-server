import { expect, it, vi } from 'vitest'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import type { WorkspaceState } from '../state.js'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { hit } from '../draw/canvas.js'
it('uses direct controls and preserves the chosen job when the list changes before confirmation', async () => {
  let state: WorkspaceState = { ...createWorkspace('models'), setupComplete: true, selected: 1 }
  state.libraryView = 'downloads'
  state.workspace = {
    api: {},
    eye: 'offline',
    services: [],
    downloads: [],
    setups: [
      { id: 'first', stage: 'downloading', plan: { model_id: 'First' } },
      { id: 'second', stage: 'downloading', plan: { model_id: 'Second' } },
    ],
  } as unknown as NonNullable<WorkspaceState['workspace']>
  const execute = vi.fn(async () => ({}))
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: {
      runtime: { execute, snapshot: async () => state.workspace },
    } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  const frame = workspaceFrame(state, 80, 24, 0)
  const target = frame.targets.find((t) => t.id === 'download-remove:setup:second')!
  expect(hit(frame, target.x, target.y)?.id).toBe(target.id)
  await activate(target.id, ctx)
  expect(execute).not.toHaveBeenCalled()
  expect(state.overlay).toBe('download-remove')
  state.workspace!.setups = state.workspace!.setups.slice(1)
  await activate('download-remove-confirm', ctx)
  expect(execute).toHaveBeenCalledWith('downloads.remove', { id: 'second', owner: 'setup' })
})
it('places Delete beside each installed model instead of a Manage menu', () => {
  const state = createWorkspace('models')
  state.setupComplete = true
  state.libraryView = 'installed'
  state.installed = [{ id: 'owner/model', name: 'Model', provider: 'llamacpp' }]
  const frame = workspaceFrame(state, 80, 24, 0)
  expect(frame.targets.some((t) => t.id === 'installed-delete:owner%2Fmodel')).toBe(true)
  expect(frame.targets.some((t) => t.id === 'tools:models')).toBe(false)
})
