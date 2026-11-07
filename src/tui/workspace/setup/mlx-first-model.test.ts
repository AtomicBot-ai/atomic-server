import { expect, it, vi } from 'vitest'
import { newSetup } from '../../../terminal-setup/index.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import { firstRunAction } from './first-run.js'

it.each([false, true])(
  'downloads MLX through its artifact plan, with a lost snapshot: %s',
  async (lostSnapshot) => {
    let state = createWorkspace('setup')
    state.firstRun = 'model'
    state.engine = 'mlx|1|arm64'
    state.setup = {
      ...newSetup('server'),
      engine: 'mlx',
      stage: 'models',
      repositories: [{ id: 'mlx-community/model', downloads: 0, source: { format: 'mlx' } }],
    }
    const execute = vi.fn(async (name: string, _input?: Record<string, unknown>) =>
      name === 'artifacts.plan'
        ? { digest: 'mlx-plan', model_id: 'mlx-community/model', engine: 'mlx', blockers: [] }
        : { id: 'mlx-job' }
    )
    const save = vi.fn(async () => {})
    const files = vi.fn(async () => {
      throw new Error('MLX must never enter the GGUF picker')
    })
    const snapshot = vi.fn(async () => null)
    if (lostSnapshot) snapshot.mockRejectedValueOnce(new Error('Snapshot response lost'))
    const ctx: ActionContext = {
      get: () => state,
      update: (fn) => {
        state = fn(state)
      },
      controller: {
        save,
        files,
        runtime: { execute, snapshot },
      } as unknown as WorkspaceController,
      send: vi.fn(),
      cancel: vi.fn(),
      copy: vi.fn(),
    }
    await firstRunAction('first-model-continue', ctx)
    if (lostSnapshot) await firstRunAction('first-model-continue', ctx)
    const installs = execute.mock.calls.filter(([name]) => name === 'artifacts.install')
    expect(new Set(installs.map(([, input]) => input?.request_id)).size).toBe(1)
    expect(execute).toHaveBeenCalledWith('artifacts.plan', {
      category: 'text',
      model_id: 'mlx-community/model',
    })
    expect(execute).toHaveBeenCalledWith('artifacts.install', {
      plan_digest: 'mlx-plan',
      request_id: expect.stringMatching(/^terminal-/),
    })
    expect(save).toHaveBeenCalledWith('tui.model', 'mlx-community/model')
    expect(state).toMatchObject({ firstRun: 'permissions', page: 'welcome', model: 'mlx-community/model' })
    expect(files).not.toHaveBeenCalled()
  }
)
