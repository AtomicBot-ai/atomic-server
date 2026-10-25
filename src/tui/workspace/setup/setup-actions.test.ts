import { expect, it, vi } from 'vitest'
import { setupAction } from './setup-actions.js'
import { createWorkspace } from '../state.js'
import { newSetup } from '../../../terminal-setup/index.js'
import type { SetupSelection } from '../../../terminal-setup/index.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { AtcError } from '../../../errors/index.js'
const selection = {
  request: { repo: 'AtomicChat/model', file: 'model.gguf' },
  requestId: 'one',
  plan: { model_id: 'model', provider: 'llamacpp-upstream', engine: null },
} as SetupSelection
function harness(plan = vi.fn(async () => selection)) {
  let state = createWorkspace('setup')
  state.setup = {
    ...newSetup('server'),
    stage: 'models',
    repository: 'AtomicChat/model',
    files: [{ filename: 'model.gguf', size: 1000 }],
    engine: 'llamacpp-upstream|b1|cpu',
  }
  const begin = vi.fn(async () => ({ manifest: { startedAt: 10 } }))
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: { setup: { plan, begin } } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  return { ctx, begin, plan }
}
it('opens progress immediately on selection and lets Cancel escape a stuck plan without starting a download', async () => {
  let resolve!: (v: SetupSelection) => void
  const { ctx, begin } = harness(
    vi.fn(
      () =>
        new Promise((r) => {
          resolve = r
        })
    )
  )
  const working = setupAction('setup-file:0', ctx)
  expect(ctx.get().setup).toMatchObject({ stage: 'download', preparing: true, busy: true })
  expect(ctx.get().focus).toBe('setup-cancel')
  await setupAction('setup-cancel', ctx)
  await working
  expect(ctx.get().setup).toMatchObject({ stage: 'models', busy: false, preparing: false })
  resolve(selection)
  await Promise.resolve()
  expect(begin).not.toHaveBeenCalled()
  expect(ctx.get().setup?.stage).toBe('models')
})
it('recovers from a timed-out model check with Retry and starts the download automatically', async () => {
  vi.useFakeTimers()
  const { ctx, begin, plan } = harness(vi.fn(() => new Promise(() => {})))
  try {
    const waiting = setupAction('setup-file:0', ctx)
    await vi.advanceTimersByTimeAsync(45000)
    await waiting
    expect(ctx.get().setup).toMatchObject({ stage: 'download', busy: false, preparing: true })
    expect(ctx.get().setup?.error).toContain('too long')
    plan.mockResolvedValueOnce(selection)
    await setupAction('setup-retry', ctx)
    expect(ctx.get().setup).toMatchObject({ stage: 'download', preparing: false })
    expect(begin).toHaveBeenCalledOnce()
    expect(begin).toHaveBeenCalledWith('server', 'llamacpp-upstream|b1|cpu', [selection])
    expect(ctx.get().setup).toMatchObject({ preparing: false, busy: false, error: '' })
  } finally {
    vi.useRealTimers()
  }
})
it('keeps a selected TurboQuant engine for ordinary GGUF models', async () => {
  const { ctx, begin } = harness()
  ctx.update((s) => ({ ...s, setup: { ...s.setup!, engine: 'llamacpp|v1|metal' } }))
  await setupAction('setup-file:0', ctx)
  await setupAction('setup-install', ctx)
  expect(begin).toHaveBeenCalledWith('server', 'llamacpp|v1|metal', [selection])
})

it('chooses an engine and starts the selected model without a confirmation screen', async () => {
  const { ctx, begin } = harness()
  Object.assign(ctx.controller, {
    hub: vi.fn(async () => [{ id: 'AtomicChat/model', downloads: 1 }]),
    files: vi.fn(async () => [{ filename: 'model.gguf', size: 1000 }]),
  })
  ctx.update((s) => ({ ...s, setup: { ...s.setup!, stage: 'engine' } }))
  await setupAction('setup-engine:llamacpp-upstream|b1|cpu', ctx)
  expect(ctx.get().setup?.stage).toBe('models')
  expect(ctx.get().focus).toBe('setup-repo:0')
  await setupAction('setup-repo:0', ctx)
  expect(ctx.get().setup?.stage).toBe('download')
  expect(begin).toHaveBeenCalledOnce()
})

// A server that dies while starting (a busy admin port): the engine screen says why, not "no build".
it('keeps the reason and hint when the server does not start for the engine check', async () => {
  let state = createWorkspace('setup')
  state.setup = { ...newSetup('server'), busy: true }
  const failure = new AtcError('ATC_DAEMON_START_FAILED', 'The server did not start.', {
    details: 'error: The admin could not listen on 127.0.0.1:1338.\n  the port is in use',
    hint: 'see `atc logs`',
  })
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: {
      initializeKeys: async () => undefined,
      setup: {
        catalogs: vi.fn(async () => Promise.reject(failure)),
        engines: vi.fn(async () => Promise.reject(failure)),
        installed: vi.fn(async () => Promise.reject(failure)),
      },
    } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  await setupAction('setup-refresh', ctx)
  expect(state.setup).toMatchObject({ busy: false, catalogs: [] })
  expect(state.setup!.error).toBe(
    'The server did not start.\nerror: The admin could not listen on 127.0.0.1:1338.\n  the port is in use\nHint: see `atc logs`'
  )
})
