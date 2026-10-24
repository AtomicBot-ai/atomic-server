/** A managed engine's load in the TUI chat: its stage and time, cancel, the log after a failure, images. */
import { describe, expect, it, vi } from 'vitest'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { workspaceFrame } from '../frame.js'
import { createWorkspace } from '../state.js'

const MODEL = 'Qwen/Qwen3.5-2B'
function chat(over: Partial<ReturnType<typeof createWorkspace>> = {}) {
  let s = { ...createWorkspace('chat'), setupComplete: true, model: MODEL, engine: 'vllm', ...over }
  const execute = vi.fn(async () => ({}))
  const ctx: ActionContext = {
    get: () => s,
    update: (fn) => {
      s = fn(s)
    },
    controller: { runtime: { execute, snapshot: async () => null } } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  const screen = () =>
    workspaceFrame(s, 120, 36, 0)
      .cells.map((r) => r.map((c) => c.char).join(''))
      .join('\n')
  const targets = () => workspaceFrame(s, 120, 36, 0).targets.map((t) => t.id)
  return { ctx, execute, get: () => s, screen, targets }
}
const loading = {
  loads: [
    {
      provider: 'vllm',
      model_id: MODEL,
      generation: 'g',
      stage: 'starting-container',
      elapsed_ms: 2000,
      at: Date.now(),
    },
  ],
  engines: [],
  host_steps: [],
  services: [],
  setups: [],
  downloads: [],
  api: { running: true },
  eye: 'starting',
  metrics: {},
}

describe('a managed load in the TUI chat', () => {
  it('shows the stage with its time and cancels the load', async () => {
    const t = chat({ workspace: loading as never })
    expect(t.screen()).toMatch(/Starting the container \(\d+s\)/)
    expect(t.targets()).toContain('cancel-load')
    await activate('cancel-load', t.ctx)
    expect(t.execute).toHaveBeenCalledWith('models.cancel', { provider: 'vllm', model_id: MODEL })
  })

  it('shows the stage of a model loading in place of the chat’s current one, and cancels that load', async () => {
    const t = chat({ model: 'old/model', workspace: loading as never })
    expect(t.screen()).toMatch(/Loading Qwen\/Qwen3\.5-2B: Starting the container/)
    await activate('cancel-load', t.ctx)
    expect(t.execute).toHaveBeenCalledWith('models.cancel', { provider: 'vllm', model_id: MODEL })
  })

  it('shows the stage in the cockpit too', () => {
    const t = chat({ page: 'server', workspace: loading as never })
    expect(t.screen()).toMatch(/vllm .*Starting the container/)
  })

  it('shows a failed load in the cockpit with the last attempt’s log, and comes back there', async () => {
    const t = chat({
      page: 'server',
      loadError: { provider: 'vllm', model: MODEL, message: 'The container exited.' },
    })
    expect(t.screen()).toMatch(/Load failed: Qwen\/Qwen3\.5-2B on vllm: The container exited\./)
    expect(t.targets()).toContain('load-log')
    await activate('load-log', t.ctx)
    expect(t.get()).toMatchObject({ page: 'tools', operation: 'models.logs', operationReturn: 'server' })
  })

  it('offers the last attempt’s log after a failed load', async () => {
    const t = chat({ loadError: { provider: 'vllm', model: MODEL, message: 'The container exited.' } })
    expect(t.screen()).toContain('The container exited.')
    await activate('load-log', t.ctx)
    expect(t.get()).toMatchObject({ page: 'tools', operation: 'models.logs' })
    expect(JSON.parse(t.get().operationInput)).toEqual({ provider: 'vllm', model_id: MODEL })
  })

  it('makes + Image unavailable for a model without vision', async () => {
    const t = chat({ modelVision: false })
    expect(t.screen()).not.toContain('+ Image')
    await activate('images', t.ctx)
    expect(t.get().overlay).toBeNull()
    expect(t.get().message).toMatch(/does not take images/)
  })
})
