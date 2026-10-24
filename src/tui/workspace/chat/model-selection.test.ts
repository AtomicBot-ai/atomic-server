import { expect, it, vi } from 'vitest'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { selectEndpointModel, selectLocalModel } from './model-selection.js'
import { loadAction } from './chat-load.js'
import { chatReadiness } from './readiness.js'

function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function fixture() {
  let state = {
    ...createWorkspace('chat'),
    setupComplete: true,
    draft: 'Keep the draft',
    model: 'old',
    installed: ['first', 'second'].map((id) => ({ id, name: id, provider: 'llamacpp-upstream' })),
  }
  const tasks = [deferred(), deferred(), deferred()]
  let index = 0
  const loadModel = vi.fn(() => tasks[index++]!.promise),
    save = vi.fn(async () => {})
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    send: vi.fn(),
    copy: vi.fn(),
    cancel: vi.fn(),
    controller: {
      loadModel,
      save,
      localEndpoint: async () => 'http://127.0.0.1:1337/v1',
      runtime: { execute: vi.fn(async () => ({ vision: true })) },
    } as unknown as WorkspaceController,
  }
  return { ctx, tasks, loadModel, save }
}
const rowText = (frame: ReturnType<typeof workspaceFrame>, y: number) =>
  frame.cells[y]!.map((cell) => cell.char).join('')

it.each([
  [54, 24],
  [120, 36],
])(
  'changes the selected button immediately and animates inside the composer at %i×%i',
  async (width, height) => {
    const t = fixture()
    const pending = selectLocalModel('installed:0', t.ctx)
    expect(t.ctx.get()).toMatchObject({
      model: 'first',
      overlay: null,
      focus: 'composer',
      draft: 'Keep the draft',
      modelLoad: { model: 'first' },
    })
    expect(chatReadiness(t.ctx.get())).toMatchObject({ ready: false, waiting: true })
    const first = workspaceFrame(t.ctx.get(), width!, height!, 0)
    const composer = first.targets.find((target) => target.id === 'composer')!
    const choose = first.targets.find((target) => target.id === 'choose-model')!
    expect(rowText(first, choose.y)).toContain('first')
    expect(rowText(first, composer.y - 1)).toContain('Loading model')
    const cancel = first.targets.find((target) => target.id === 'cancel-load')!
    expect(cancel.y).toBe(composer.y - 1)
    expect(cancel.x + cancel.width).toBeLessThanOrEqual(width!)
    const animated = workspaceFrame(t.ctx.get(), width!, height!, 0.25)
    expect(rowText(first, cancel.y)).not.toBe(rowText(animated, cancel.y))
    t.ctx.update((state) => ({ ...state, motion: false }))
    expect(rowText(workspaceFrame(t.ctx.get(), width!, height!, 0), cancel.y)).toBe(
      rowText(workspaceFrame(t.ctx.get(), width!, height!, 1), cancel.y)
    )
    await vi.waitFor(() => expect(t.loadModel).toHaveBeenCalledOnce())
    t.tasks[0]!.resolve()
    await pending
    expect(t.ctx.get()).toMatchObject({
      model: 'first',
      modelLoad: null,
      loadError: null,
      modelVision: true,
      busy: false,
    })
  }
)

it('keeps the latest selection when earlier loads succeed or fail later', async () => {
  const t = fixture()
  const old = selectLocalModel('installed:0', t.ctx)
  await vi.waitFor(() => expect(t.loadModel).toHaveBeenCalledTimes(1))
  const latest = selectLocalModel('installed:1', t.ctx)
  await vi.waitFor(() => expect(t.loadModel).toHaveBeenCalledTimes(2))
  t.tasks[1]!.resolve()
  await latest
  t.tasks[0]!.reject(new Error('Old load failed'))
  await old
  expect(t.ctx.get()).toMatchObject({ model: 'second', modelLoad: null, loadError: null, busy: false })
  expect(t.save).not.toHaveBeenCalledWith('tui.model', 'first')
  expect(t.save).toHaveBeenCalledWith('tui.model', 'second')
  const another = selectLocalModel('installed:0', t.ctx)
  await vi.waitFor(() => expect(t.loadModel).toHaveBeenCalledTimes(3))
  await selectEndpointModel('remote', t.ctx)
  t.tasks[2]!.resolve()
  await another
  expect(t.ctx.get()).toMatchObject({ model: 'remote', modelLoad: null, loadError: null, busy: false })
  expect(t.save).toHaveBeenLastCalledWith('tui.endpoint', 'http://127.0.0.1:1337/v1')
  expect(t.save).not.toHaveBeenCalledWith('tui.model', 'first')
})

it('keeps the failed choice visible with a working Retry action in the composer', async () => {
  const t = fixture(),
    pending = selectLocalModel('installed:0', t.ctx)
  await vi.waitFor(() => expect(t.loadModel).toHaveBeenCalledOnce())
  t.tasks[0]!.reject(new Error('Not enough memory'))
  await pending
  expect(t.ctx.get()).toMatchObject({
    model: 'first',
    modelLoad: null,
    loadError: { model: 'first', message: 'Not enough memory' },
  })
  expect(chatReadiness(t.ctx.get())).toMatchObject({ ready: false, waiting: false })
  const frame = workspaceFrame(t.ctx.get(), 120, 36, 0)
  const retry = frame.targets.find((target) => target.id === 'retry-load')!
  expect(retry.y).toBe(frame.targets.find((target) => target.id === 'composer')!.y - 1)
  expect(rowText(frame, retry.y)).toContain('Not enough memory')
  const again = loadAction('retry-load', t.ctx)
  await vi.waitFor(() => expect(t.loadModel).toHaveBeenCalledTimes(2))
  expect(t.ctx.get()).toMatchObject({ loadError: null, modelLoad: { model: 'first' } })
  t.tasks[1]!.resolve()
  await again
  expect(t.ctx.get().loadError).toBeNull()
})
