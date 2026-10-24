import { expect, it, vi } from 'vitest'
import { defaultConfig, resolveConfig } from '../../config/index.js'
import { startup } from './startup.js'
import type { WorkspaceController } from './controller.js'

it.each([
  [null, 'welcome', false],
  [{ complete: false }, 'welcome', false],
  [{ complete: true }, 'server', true],
  [{ complete: false, onboarded: true }, 'server', true],
])('separates first-run completion from later downloads: %j', async (flags, page, complete) => {
  const c = {
    config: async () => ({ values: defaultConfig() }),
    history: { list: async () => [] },
    engineSelection: { read: async () => '' },
    setup: {
      read: async () =>
        flags
          ? {
              ...flags,
              mode: 'personal',
              startedAt: 1,
              selections: [],
              engine: { provider: 'llamacpp-upstream', version: 'v1', backend: 'cpu' },
            }
          : null,
    },
  } as unknown as WorkspaceController
  for (const initial of [undefined, 'welcome', 'setup'] as const) {
    expect(await startup(c, initial)).toMatchObject({ page, setupComplete: complete })
  }
  if (complete) expect(await startup(c, 'models')).toMatchObject({ page: 'models', setupComplete: true })
  if (flags && !complete)
    expect(await startup(c)).toMatchObject({
      firstRun: 'permissions',
      focus: 'first-permission:notifications',
      setup: { stage: 'download' },
    })
})

it('honors a legacy manual choice whose verification flag is false', async () => {
  const c = {
    config: async () => ({ values: defaultConfig() }),
    history: { list: async () => [] },
    engineSelection: { read: async () => '' },
    setup: { read: async () => null },
    runtime: { setup: async () => ({ mode: 'manual', complete: false, updated_at: 1 }) },
  } as unknown as WorkspaceController
  expect(await startup(c)).toMatchObject({ page: 'server', firstRun: null, setupComplete: true })
})

it.each([63163, 0])('defaults to this workspace endpoint when the API port is %s', async (port) => {
  const config = resolveConfig({ env: {}, flags: { 'api.port': port } })
  const localEndpoint = vi.fn(async () => 'http://127.0.0.1:63163/v1')
  const c = {
    config: async () => config,
    localEndpoint,
    history: { list: async () => [] },
    engineSelection: { read: async () => '' },
    setup: { read: async () => null },
  } as unknown as WorkspaceController
  expect((await startup(c)).endpoint).toBe('http://127.0.0.1:63163/v1')
  expect(localEndpoint).toHaveBeenCalledOnce()
})

it.each(['file', 'env', 'flag'] as const)('preserves an explicit %s endpoint', async (source) => {
  const endpoint = 'https://remote.example/v1'
  const config = resolveConfig({ env: {}, flags: { 'tui.endpoint': endpoint, 'api.port': 63163 } })
  config.sources['tui.endpoint'] = source
  const localEndpoint = vi.fn(async () => 'http://127.0.0.1:63163/v1')
  const c = {
    config: async () => config,
    localEndpoint,
    history: { list: async () => [] },
    engineSelection: { read: async () => '' },
    setup: { read: async () => null },
  } as unknown as WorkspaceController
  expect((await startup(c)).endpoint).toBe(endpoint)
  expect(localEndpoint).not.toHaveBeenCalled()
})
