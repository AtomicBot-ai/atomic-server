import { expect, it, vi } from 'vitest'
import type { ActionContext } from '../actions.js'
import { createWorkspace, type WorkspaceState } from '../state.js'
import type { WorkspaceController } from '../controller.js'
import { apiAction } from './api-actions.js'
import { workspaceFrame } from '../frame.js'
import { activate } from '../actions.js'
import type { WorkspaceSnapshot } from '../../../contract/index.js'
import { newSetup } from '../../../terminal-setup/index.js'

function context(s: WorkspaceState) {
  const api = vi.fn(async () => {})
  const snapshot = vi.fn(async () => s.workspace)
  const ctx: ActionContext = {
    get: () => s,
    update: (fn) => {
      s = fn(s)
    },
    controller: { api, runtime: { snapshot } } as unknown as WorkspaceController,
  } as ActionContext
  return { ctx, api, snapshot, state: () => s }
}

// The API serves without a model: Start starts it and says what is still to choose.
it('starts the API with nothing loaded, and says a model is still to choose', async () => {
  const s = createWorkspace()
  s.workspace = {
    api: { running: false },
    services: [],
    setups: [],
    downloads: [],
    loads: [],
  } as unknown as WorkspaceSnapshot
  const { ctx, api, state } = context(s)
  expect(await apiAction('api-toggle', ctx)).toBe(true)
  expect(api).toHaveBeenCalledWith(true, true)
  expect(state().message).toBe('API started. Choose and download a model to continue.')
  expect(state().page).not.toBe('models')
})

it.each([false, true])('routes the visible API button even when setupComplete=%s', async (complete) => {
  const s = createWorkspace('server')
  s.setupComplete = complete
  s.firstRun = null
  s.workspace = {
    api: { running: false },
    services: [],
    setups: [],
    downloads: [],
    loads: [],
  } as unknown as WorkspaceSnapshot
  const { ctx, api } = context(s)
  await activate('api-toggle', ctx)
  expect(api).toHaveBeenCalledWith(true, true)
})

it('can stop while another model operation is busy and focuses the confirmation', async () => {
  const s = createWorkspace('server')
  s.setupComplete = true
  s.firstRun = null
  s.busy = true
  s.workspace = {
    api: { running: true },
    services: [],
    setups: [],
    downloads: [],
    loads: [],
  } as unknown as WorkspaceSnapshot
  const { ctx, api, snapshot, state } = context(s)
  await activate('api-toggle', ctx)
  expect(state().overlay).toBe('stop')
  expect(state().focus).toBe('stop-confirm')
  snapshot.mockResolvedValueOnce({ ...s.workspace!, api: { ...s.workspace!.api, running: false } })
  await activate('stop-confirm', ctx)
  expect(api).toHaveBeenCalledWith(false)
  expect(state().workspace?.api.running).toBe(false)
  expect(state().apiPending).toBeUndefined()
  expect(state().busy).toBe(true)
})

it('keeps the pending state until the start finishes and permits retry after failure', async () => {
  const s = createWorkspace('server')
  s.setupComplete = true
  s.workspace = {
    api: { running: false },
    services: [],
    setups: [],
    downloads: [],
    loads: [],
  } as unknown as WorkspaceSnapshot
  const { ctx, api, snapshot, state } = context(s)
  let reject!: (error: Error) => void
  api.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail
      })
  )
  const starting = apiAction('api-toggle', ctx)
  expect(state().apiPending).toBe('starting')
  ctx.update((v) => ({ ...v, message: '' }))
  await apiAction('api-toggle', ctx)
  expect(api).toHaveBeenCalledTimes(1)
  reject(new Error('Port is in use'))
  await expect(starting).rejects.toThrow('Port is in use')
  expect(state().apiPending).toBeUndefined()
  snapshot.mockResolvedValueOnce({ ...s.workspace!, api: { ...s.workspace!.api, running: true } })
  await apiAction('api-toggle', ctx)
  expect(state().workspace?.api.running).toBe(true)
})

it.each([false, true])(
  'does not start or stop an API while the model downloads (listener running=%s)',
  async (running) => {
    const s = createWorkspace('server')
    s.setupComplete = true
    s.workspace = {
      api: { running },
      services: [],
      downloads: [],
      loads: [],
      setups: [{ setup_id: 'd', stage: 'downloading_model', plan: { model_id: 'q' } }],
    } as unknown as WorkspaceSnapshot
    const { ctx, api, state } = context(s)
    const frame = workspaceFrame(s, 120, 36, 0)
    const display = frame.cells.map((r) => r.map((c) => c.char).join('')).join('\n')
    expect(display).toContain('downloading...')
    expect(display).not.toContain('Stop API')
    expect(frame.targets.find((t) => t.id === 'api-toggle')?.hint).toContain('Wait for the model')
    await activate('api-toggle', ctx)
    expect(api).not.toHaveBeenCalled()
    expect(state().overlay).toBeNull()
    expect(state().message).toContain('Wait for the model to download')
    expect(state().downloadAttention).toBe(1)
  }
)

it('shows a waiting control after explicit override while the download is still being prepared', async () => {
  const s = createWorkspace('server')
  s.setupComplete = true
  s.firstRun = null
  s.setup = { ...newSetup('server'), preparing: true, repository: 'owner/model', destination: 'server' }
  s.workspace = {
    api: { running: true },
    services: [],
    setups: [],
    downloads: [],
  } as unknown as WorkspaceSnapshot
  const { ctx, api, state } = context(s)
  const frame = workspaceFrame(s, 120, 36, 0)
  const display = frame.cells.map((row) => row.map((c) => c.char).join('')).join('\n')
  expect(display).toContain('preparing...')
  expect(display).not.toContain('Stop API')
  await activate('api-toggle', ctx)
  expect(api).not.toHaveBeenCalled()
  expect(state().message).toContain('Wait for the model download')
})

it.each([false, true])(
  'keeps API controls usable during an unrelated audio download (running=%s)',
  async (running) => {
    const s = createWorkspace('server')
    s.setupComplete = true
    s.workspace = {
      api: { running },
      services: [],
      setups: [],
      loads: [],
      selection: { model: 'qwen', engine: 'llamacpp-upstream|b1|cpu' },
      downloads: [{ id: 'audio', kind: 'engine', engine: 'audio-cpp', stage: 'downloading' }],
    } as unknown as WorkspaceSnapshot
    const { ctx, api, state } = context(s)
    await activate('api-toggle', ctx)
    if (running) {
      expect(state().overlay).toBe('stop')
      await activate('stop-confirm', ctx)
      expect(api).toHaveBeenCalledWith(false)
    } else expect(api).toHaveBeenCalledWith(true, true)
  }
)
