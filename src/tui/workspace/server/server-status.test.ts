import { expect, it } from 'vitest'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import { serverSelection } from './server-status.js'

it('uses the shared loaded model and provider until the user makes an explicit draft', () => {
  const state = {
    ...createWorkspace('server'),
    engine: 'old',
    model: 'old-model',
    workspace: { services: [{ kind: 'chat', provider: 'mlx', model: 'new-model' }] },
    engines: [{ id: 'mlx|v1|metal', provider: 'mlx' }],
  } as unknown as WorkspaceState
  expect(serverSelection(state)).toEqual({ engine: 'mlx|v1|metal', model: 'new-model' })
  const draft = { engine: 'local-draft', model: 'draft-model' }
  expect(serverSelection({ ...state, serverDraft: draft })).toEqual(draft)
  expect(serverSelection({ ...state, workspace: { services: [] } as never }).model).toBe('')
})
