import { expect, it, vi } from 'vitest'
import type { ActionContext } from '../actions.js'
import { createWorkspace, type WorkspaceState } from '../state.js'
import type { WorkspaceController } from '../controller.js'
import { apiAction } from './api-actions.js'

function context(s: WorkspaceState) {
  const api = vi.fn(async () => {})
  const ctx: ActionContext = {
    get: () => s,
    update: (fn) => {
      s = fn(s)
    },
    controller: { api } as unknown as WorkspaceController,
  } as ActionContext
  return { ctx, api, state: () => s }
}

// The API serves without a model: Start starts it and says what is still to choose.
it('starts the API with nothing loaded, and says a model is still to choose', async () => {
  const s = createWorkspace()
  s.workspace = { api: { running: false }, services: [], setups: [], downloads: [], loads: [] } as never
  const { ctx, api, state } = context(s)
  expect(await apiAction('api-toggle', ctx)).toBe(true)
  expect(api).toHaveBeenCalledWith(true)
  expect(state().message).toBe('API started. Choose and download a model to continue.')
  expect(state().page).not.toBe('models')
})
