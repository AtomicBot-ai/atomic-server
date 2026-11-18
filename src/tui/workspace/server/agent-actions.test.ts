import { expect, it, vi } from 'vitest'
import type { ActionContext } from '../action-types.js'
import { createWorkspace, type WorkspaceState } from '../state.js'
import type { WorkspaceController } from '../controller.js'
import { agentAction } from './agent-actions.js'

function context(s: WorkspaceState, models: () => Promise<string[]>) {
  const ctx: ActionContext = {
    get: () => s,
    update: (fn) => {
      s = fn(s)
    },
    controller: { models: vi.fn(models) } as unknown as WorkspaceController,
  } as ActionContext
  return { ctx, state: () => s }
}

/** A finished setup with the API serving but no model loaded yet. */
function servingWithoutModel() {
  const s = createWorkspace('server')
  s.setupComplete = true
  s.firstRun = null
  s.base = {
    ...s.base,
    daemon: {
      kind: 'up',
      record: undefined,
      pending: [],
      snapshot: { server: { running: true, host: '127.0.0.1', port: 8080, prefix: '/v1' } },
    } as unknown as WorkspaceState['base']['daemon'],
  }
  return s
}

// An empty but successful model list is a precondition: the refusal stays a message in the workspace.
it('refuses to open an agent when no model is loaded without throwing', async () => {
  const s = servingWithoutModel()
  const { ctx, state } = context(s, async () => [])
  await expect(agentAction('agent:claude', ctx)).resolves.toBe(true)
  expect(state().message).toBe('Load a text model in Models before opening an agent.')
  expect(state().busy).toBe(false)
  expect(state().overlay).toBeNull()
})

// A real failure of the lookup still propagates to the reporting boundary.
it('keeps a failed model lookup reported instead of turning it into a refusal', async () => {
  const s = servingWithoutModel()
  const { ctx, state } = context(s, async () => {
    throw new Error('Model list returned HTTP 503. Check the endpoint and API key.')
  })
  await expect(agentAction('agent:claude', ctx)).rejects.toThrow('Model list returned HTTP 503')
  expect(state().message).not.toBe('Load a text model in Models before opening an agent.')
  expect(state().busy).toBe(false)
})
