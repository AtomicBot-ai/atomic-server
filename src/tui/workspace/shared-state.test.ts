import { expect, it } from 'vitest'
import { createWorkspace } from './state.js'
import type { WorkspaceState } from './state.js'
import { applyWorkspaceSnapshot } from './shared-state.js'
import type { WorkspaceSnapshot } from '../../contract/index.js'

const snapshot = {
  setup: { mode: 'manual', complete: true, updated_at: 2 },
  keys: [],
  setups: [],
  downloads: [],
} as unknown as WorkspaceSnapshot

it.each(['cloud', 'setup-permission'] as const)(
  'closes first-run %s after another client finishes it without dropping unrelated drafts',
  (overlay) => {
    const state = {
      ...createWorkspace('welcome'),
      overlay,
      firstRun: 'cloud' as const,
      draft: 'Keep this message',
      configDraft: { 'api.port': '3001' },
    }
    expect(applyWorkspaceSnapshot(state, snapshot, 2)).toMatchObject({
      page: 'server',
      setupComplete: true,
      firstRun: null,
      setup: null,
      overlay: null,
      draft: state.draft,
      configDraft: state.configDraft,
    })
  }
)

it('leaves an explicitly reopened setup and other dialogs in place', () => {
  const state = {
    ...createWorkspace('server'),
    setupComplete: true,
    overlay: 'connection-guide' as const,
    serverQuery: 'Claude',
  }
  expect(applyWorkspaceSnapshot(state, snapshot, 2)).toMatchObject({
    page: 'server',
    overlay: 'connection-guide',
    serverQuery: 'Claude',
  })
})

it('does not navigate away from a later page or close its unrelated dialog', () => {
  const state = {
    ...createWorkspace('models'),
    firstRun: 'media' as const,
    overlay: 'download-remove' as const,
    libraryView: 'downloads' as const,
  }
  expect(applyWorkspaceSnapshot(state, snapshot, 2)).toMatchObject({
    page: 'models',
    firstRun: null,
    overlay: 'download-remove',
    libraryView: 'downloads',
  })
})

it.each(['preparing', 'done'] as const)(
  'preserves this client’s %s connection result when its completion becomes shared',
  (step) => {
    const state = {
      ...createWorkspace('welcome'),
      firstRun: 'connect',
      overlay: 'connection-guide',
      connection: { step, command: 'atc connect codex' },
    } as unknown as WorkspaceState
    expect(applyWorkspaceSnapshot(state, snapshot, 2)).toMatchObject({
      setupComplete: true,
      firstRun: 'connect',
      overlay: 'connection-guide',
      connection: state.connection,
    })
  }
)

it('keeps Help open while the onboarding beneath it finishes remotely', () => {
  const state = {
    ...createWorkspace('welcome'),
    firstRun: 'cloud' as const,
    overlay: 'help' as const,
    focus: 'close',
  }
  expect(applyWorkspaceSnapshot(state, snapshot, 2)).toMatchObject({
    page: 'server',
    firstRun: null,
    setupComplete: true,
    overlay: 'help',
    focus: 'close',
  })
})
