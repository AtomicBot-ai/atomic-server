import { expect, it } from 'vitest'
import { defaultConfig } from '../../config/index.js'
import { startup } from './startup.js'
import type { WorkspaceController } from './controller.js'

it.each([
  [null, 'welcome', false],
  [{ complete: false }, 'setup', false],
  [{ complete: true }, 'chat', true],
  [{ complete: false, onboarded: true }, 'chat', true],
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
})
