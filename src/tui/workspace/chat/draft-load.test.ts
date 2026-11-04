import { expect, it, vi } from 'vitest'
import type { WorkspaceSnapshot } from '../../../contract/index.js'
import type { ActionContext } from '../action-types.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { draftLoadAvailable, loadDraftAction } from './draft-load.js'
import { selectEndpointModel } from './model-selection.js'
import { loadAction } from './chat-load.js'
import { readinessPatch } from './readiness.js'

function fixture(running = false) {
  const endpoint = 'http://127.0.0.1:1337/v1'
  let state = {
    ...createWorkspace('chat'),
    setupComplete: true,
    endpointFollowsServer: true,
    model: 'local-model',
    draft: 'Send exactly this',
    cursor: 17,
    installed: [{ id: 'local-model', name: 'Local model', provider: 'llamacpp-upstream' }],
    workspace: {
      api: { running, endpoint },
      services: [],
      setups: [],
      downloads: [],
      loads: [],
    } as unknown as WorkspaceSnapshot,
  }
  let resolve!: () => void, reject!: (error: Error) => void
  const pending = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  const loadModel = vi.fn(async () => {
    await pending
    state.workspace.services = [
      {
        id: 's',
        model: state.model,
        provider: 'llamacpp-upstream',
        kind: 'chat',
        state: 'ready',
        details: {},
      },
    ]
  })
  const api = vi.fn(async () => {
    state.workspace.api.running = true
  })
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state) as typeof state
    },
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
    controller: {
      loadModel,
      api,
      localEndpoint: async () => endpoint,
      save: vi.fn(async () => {}),
      unset: vi.fn(async () => {}),
      engineSelection: { remember: vi.fn(async () => {}) },
      runtime: { execute: vi.fn(async () => ({})), snapshot: async () => state.workspace },
    } as unknown as WorkspaceController,
  }
  return { ctx, loadModel, api, resolve, reject }
}

it.each([false, true])('loads beside the retained draft and sends once (API running=%s)', async (running) => {
  const t = fixture(running)
  expect(draftLoadAvailable(t.ctx.get())).toBe(true)
  expect(readinessPatch(t.ctx.get())).toMatchObject({ focus: 'load-and-send' })
  expect(workspaceFrame(t.ctx.get(), 80, 24, 0).targets.some((v) => v.id === 'load-and-send')).toBe(true)
  const action = loadDraftAction('load-and-send', t.ctx)
  await vi.waitFor(() => expect(t.loadModel).toHaveBeenCalledOnce())
  await loadDraftAction('load-and-send', t.ctx)
  expect(t.ctx.get()).toMatchObject({ page: 'chat', draft: 'Send exactly this', busy: true })
  expect(t.ctx.send).not.toHaveBeenCalled()
  t.resolve()
  await action
  expect(t.ctx.send).toHaveBeenCalledOnce()
  expect(t.api).toHaveBeenCalledTimes(running ? 0 : 1)
  expect(t.ctx.get()).toMatchObject({ draft: 'Send exactly this', busy: false, modelLoad: null })
})

it.each(['draft', 'page', 'model', 'cancel'] as const)(
  'never sends after %s changes while loading',
  async (change) => {
    const t = fixture()
    const action = loadDraftAction('load-and-send', t.ctx)
    await vi.waitFor(() => expect(t.loadModel).toHaveBeenCalledOnce())
    if (change === 'cancel') await loadAction('cancel-load', t.ctx)
    else
      t.ctx.update((s) => ({
        ...s,
        ...(change === 'draft'
          ? { draft: 'Edited meanwhile' }
          : change === 'page'
            ? { page: 'models' }
            : { model: 'other' }),
      }))
    t.resolve()
    await action
    expect(t.ctx.send).not.toHaveBeenCalled()
    expect(t.api).not.toHaveBeenCalled()
  }
)

it('retains the draft on failure and exposes retry and diagnostic controls', async () => {
  const t = fixture()
  const action = loadDraftAction('load-and-send', t.ctx)
  await vi.waitFor(() => expect(t.loadModel).toHaveBeenCalledOnce())
  t.reject(new Error('Not enough memory'))
  await action
  expect(t.ctx.send).not.toHaveBeenCalled()
  expect(t.ctx.get()).toMatchObject({
    draft: 'Send exactly this',
    loadError: { message: 'Not enough memory' },
    busy: false,
  })
  const targets = workspaceFrame(t.ctx.get(), 54, 20, 0).targets.map((v) => v.id)
  expect(targets).toEqual(expect.arrayContaining(['retry-load', 'load-log', 'load-and-send']))
})

it('does not offer a local load for a remote endpoint or an already loaded model', () => {
  const t = fixture()
  t.ctx.update((s) => ({ ...s, endpoint: 'https://remote.example/v1', endpointFollowsServer: false }))
  expect(draftLoadAvailable(t.ctx.get())).toBe(false)
  t.ctx.update((s) => ({
    ...s,
    endpointFollowsServer: true,
    workspace: {
      ...s.workspace!,
      services: [
        { id: 's', model: s.model, provider: 'llamacpp-upstream', kind: 'chat', state: 'ready', details: {} },
      ],
    },
  }))
  expect(draftLoadAvailable(t.ctx.get())).toBe(false)
  expect(readinessPatch(t.ctx.get())).toMatchObject({ page: 'server' })
})

it('does not send when the same model was explicitly selected again during loading', async () => {
  const t = fixture()
  const action = loadDraftAction('load-and-send', t.ctx)
  await vi.waitFor(() => expect(t.loadModel).toHaveBeenCalledOnce())
  await selectEndpointModel('local-model', t.ctx)
  t.resolve()
  await action
  expect(t.ctx.send).not.toHaveBeenCalled()
})

it('reports API startup failure separately and keeps the loaded model and unsent draft', async () => {
  const t = fixture()
  t.api.mockRejectedValueOnce(new Error('API port is busy'))
  const action = loadDraftAction('load-and-send', t.ctx)
  await vi.waitFor(() => expect(t.loadModel).toHaveBeenCalledOnce())
  t.resolve()
  await action
  expect(t.ctx.send).not.toHaveBeenCalled()
  expect(t.ctx.get()).toMatchObject({
    draft: 'Send exactly this',
    busy: false,
    loadError: null,
    chatNotice: { details: 'Error: API port is busy' },
  })
})
