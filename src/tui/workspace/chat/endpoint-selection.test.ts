import { expect, it, vi } from 'vitest'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import { selectLocalModel } from './model-selection.js'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function fixture() {
  let state = {
    ...createWorkspace('chat'),
    setupComplete: true,
    draft: 'Keep my draft',
    installed: [{ id: 'local', name: 'Local', provider: 'mlx' }],
  }
  const loading = deferred(),
    writing = deferred(),
    disk = new Map<string, string>()
  const save = vi.fn(async (key: string, value: string) => {
    disk.set(key, value)
  })
  const loadModel = vi.fn(() => loading.promise)
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
    controller: {
      save,
      unset: vi.fn(async (key: string) => {
        disk.delete(key)
      }),
      loadModel,
      localEndpoint: async () => 'http://127.0.0.1:1337/v1',
      engineSelection: { remember: vi.fn(async () => {}) },
      runtime: { execute: vi.fn(async () => ({ vision: true })) },
      run: vi.fn(async () => {}),
    } as unknown as WorkspaceController,
  }
  const endpoint = async (value = 'http://127.0.0.1:9/custom') => {
    await activate('endpoint', ctx)
    ctx.update((s) => ({ ...s, editValue: value }))
    await activate('save-edit', ctx)
  }
  return { ctx, loading, writing, disk, save, loadModel, endpoint }
}

it('a saved endpoint supersedes a local load without losing the draft or reviving its status', async () => {
  const t = fixture(),
    old = selectLocalModel('installed:0', t.ctx)
  await vi.waitFor(() => expect(t.loadModel).toHaveBeenCalledOnce())
  await t.endpoint()
  expect(t.ctx.get()).toMatchObject({ modelLoad: null, busy: false, loadError: null })
  t.loading.resolve()
  await old
  expect(t.ctx.get()).toMatchObject({
    endpoint: 'http://127.0.0.1:9/custom',
    endpointFollowsServer: false,
    model: '',
    draft: 'Keep my draft',
    message: 'Connection saved. Choose a model to begin.',
  })
  expect(Object.fromEntries(t.disk)).toMatchObject({
    'tui.endpoint': 'http://127.0.0.1:9/custom',
    'tui.model': '',
  })
})

it('orders a new endpoint after an already-started model preference write', async () => {
  const t = fixture()
  t.save.mockImplementation(async (key, value) => {
    if (key === 'tui.model' && value === 'local') await t.writing.promise
    t.disk.set(key, value)
  })
  const old = selectLocalModel('installed:0', t.ctx)
  await vi.waitFor(() => expect(t.loadModel).toHaveBeenCalledOnce())
  t.loading.resolve()
  await vi.waitFor(() => expect(t.save).toHaveBeenCalledWith('tui.model', 'local'))
  const latest = t.endpoint()
  await vi.waitFor(() => expect(t.ctx.get().endpoint).toBe('http://127.0.0.1:9/custom'))
  t.writing.resolve()
  await Promise.all([old, latest])
  expect(Object.fromEntries(t.disk)).toMatchObject({
    'tui.endpoint': 'http://127.0.0.1:9/custom',
    'tui.model': '',
  })
  expect(t.ctx.get().model).toBe('')
})

it('invalid endpoint input does not cancel the pending valid local selection', async () => {
  const t = fixture(),
    old = selectLocalModel('installed:0', t.ctx)
  await vi.waitFor(() => expect(t.loadModel).toHaveBeenCalledOnce())
  await expect(t.endpoint('not-a-url')).rejects.toThrow()
  t.loading.resolve()
  await old
  expect(t.disk.get('tui.model')).toBe('local')
})

it('a late endpoint save cannot close a newer picker or replace its model', async () => {
  const t = fixture()
  t.save.mockImplementation(async (key, value) => {
    if (key === 'tui.endpoint') await t.writing.promise
    t.disk.set(key, value)
  })
  const old = t.endpoint()
  await vi.waitFor(() => expect(t.save).toHaveBeenCalledWith('tui.endpoint', 'http://127.0.0.1:9/custom'))
  const latest = selectLocalModel('installed:0', t.ctx)
  await vi.waitFor(() => expect(t.loadModel).toHaveBeenCalledOnce())
  t.ctx.update((s) => ({ ...s, overlay: 'model-picker', focus: 'installed:0' }))
  t.writing.resolve()
  await old
  expect(t.ctx.get()).toMatchObject({ model: 'local', overlay: 'model-picker', focus: 'installed:0' })
  t.loading.resolve()
  await latest
  expect(t.disk.get('tui.model')).toBe('local')
  expect(t.disk.has('tui.endpoint')).toBe(false)
})
