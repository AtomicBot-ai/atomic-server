import { expect, it, vi } from 'vitest'
import type { BackendCatalogResponse } from '../../../terminal-setup/index.js'
import { newSetup } from '../../../terminal-setup/index.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { setupAction } from './setup-actions.js'

function harness(catalogs: BackendCatalogResponse[], registered: string[]) {
  let state = createWorkspace('setup')
  state.setup = newSetup('server')
  const ctx: ActionContext = {
    get: () => state,
    update: (update) => {
      state = update(state)
    },
    controller: {
      initializeKeys: async () => undefined,
      setup: {
        catalogs: async () => catalogs,
        engines: async () => registered,
        installed: async () => [],
      },
    } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  return ctx
}

it.each([
  { catalogs: [] },
  { catalogs: [{ provider: 'llamacpp-upstream', available: [], recommended: null }] },
])('keeps managed engine choices usable when no llama.cpp build is compatible: %j', async ({ catalogs }) => {
  const ctx = harness(catalogs as unknown as BackendCatalogResponse[], ['llamacpp-upstream', 'vllm'])
  await setupAction('setup-refresh', ctx)
  expect(ctx.get().setup).toMatchObject({
    busy: false,
    error: '',
    registered: ['llamacpp-upstream', 'vllm'],
  })
  const frame = workspaceFrame(ctx.get(), 54, 24, 0)
  expect(frame.targets.some((target) => target.id === 'setup-engine:vllm')).toBe(true)
  const screen = frame.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
  expect(screen).toContain('No compatible build available')
  expect(screen).not.toContain('Engines could not be checked')
})

it('chooses an available alternative when the preferred engine has no compatible build', async () => {
  const ctx = harness(
    [
      { provider: 'llamacpp-upstream', available: [], recommended: null },
      { provider: 'llamacpp', available: [{ version: 'v1', backend: 'cpu' }], recommended: 'v1/cpu' },
    ] as BackendCatalogResponse[],
    ['llamacpp-upstream', 'llamacpp']
  )
  await setupAction('setup-refresh', ctx)
  expect(ctx.get().setup).toMatchObject({ busy: false, error: '', engine: 'llamacpp|v1|cpu' })
  expect(ctx.get().focus).toBe('setup-engine:llamacpp|v1|cpu')
})

it('offers a refresh instead of a crash when no engine is available', async () => {
  const ctx = harness([], [])
  await setupAction('setup-refresh', ctx)
  expect(ctx.get().setup).toMatchObject({ busy: false, error: '', engine: '' })
  const frame = workspaceFrame(ctx.get(), 54, 24, 0)
  expect(frame.targets.some((target) => target.id === 'setup-refresh')).toBe(true)
  expect(frame.targets.some((target) => target.id.startsWith('setup-engine:'))).toBe(false)
})
