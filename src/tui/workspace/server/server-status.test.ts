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

it('names the last download and its engine while nothing is loaded, like the web admin', () => {
  const job = {
    setup_id: 's1',
    stage: 'ready',
    updated_at: 2,
    plan: { model_id: 'LiquidAI/LFM2-1.2B-Q4_K_M', provider: 'llamacpp-upstream' },
  }
  const state = {
    ...createWorkspace('server'),
    workspace: { services: [], setups: [job] },
  } as unknown as WorkspaceState
  expect(serverSelection(state)).toEqual({ engine: 'llamacpp-upstream', model: 'LiquidAI/LFM2-1.2B-Q4_K_M' })
  expect(serverSelection({ ...state, engine: 'llamacpp|b1|metal' })).toEqual({
    engine: 'llamacpp|b1|metal',
    model: 'LiquidAI/LFM2-1.2B-Q4_K_M',
  })
})
