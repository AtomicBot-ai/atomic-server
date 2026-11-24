import { describe, expect, it } from 'vitest'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import { withAccount } from '../account/account-model.js'
import { applyWorkspaceSnapshot } from './shared-state.js'
import type { WorkspaceSnapshot } from '../../../contract/index.js'

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

const at = (endpoint: string) =>
  ({ ...snapshot, api: { running: true, endpoint } }) as unknown as WorkspaceSnapshot

it('moves a Playground that follows this server to the address the server now has', () => {
  const state = {
    ...createWorkspace('chat'),
    endpoint: 'http://127.0.0.1:1337/v1',
    endpointFollowsServer: true,
  }
  expect(applyWorkspaceSnapshot(state, at('http://127.0.0.1:62732/v1'), 2)).toMatchObject({
    endpoint: 'http://127.0.0.1:62732/v1',
    endpointFollowsServer: true,
  })
})

it('leaves an endpoint chosen elsewhere where it is', () => {
  const state = {
    ...createWorkspace('chat'),
    endpoint: 'https://openrouter.ai/api/v1',
    endpointFollowsServer: false,
  }
  expect(applyWorkspaceSnapshot(state, at('http://127.0.0.1:62732/v1'), 2)).toMatchObject({
    endpoint: 'https://openrouter.ai/api/v1',
    endpointFollowsServer: false,
  })
})

describe('a device that disconnected', () => {
  const mac = { grant_id: 'g1', device_name: 'Work MacBook', platform: 'macos', at: 3_000 }
  const MAC = 'Work MacBook disconnected from this server.'
  const withEnded = (ended: (typeof mac)[]) =>
    ({
      ...snapshot,
      account: {
        enabled: true,
        signed_in: true,
        user: { email: 'ann@example.com', display_name: null },
        sign_in: { state: 'idle' },
        remote: { sharing: true, requests: [], devices: [], ended },
      },
    }) as unknown as WorkspaceSnapshot
  const started = applyWorkspaceSnapshot(
    { ...createWorkspace('server'), setupComplete: true },
    withEnded([]),
    1
  )

  it('is said once, on the snapshot that first lists it', () => {
    const first = applyWorkspaceSnapshot(started, withEnded([mac]), 2)
    expect(first.message).toBe(MAC)
    expect(applyWorkspaceSnapshot({ ...first, message: '' }, withEnded([mac]), 3).message).toBe('')
  })

  it('is old news in the first snapshot after the terminal starts', () => {
    const open = { ...createWorkspace('server'), setupComplete: true }
    expect(applyWorkspaceSnapshot(open, withEnded([mac]), 2).message).toBe('')
  })

  it('waits for a dialog to close, then the next snapshot says it', () => {
    const behind = applyWorkspaceSnapshot({ ...started, overlay: 'help' }, withEnded([mac]), 2)
    expect(behind.message).toBe('')
    const closed = { ...behind, overlay: null, message: '' }
    expect(applyWorkspaceSnapshot(closed, withEnded([mac]), 3).message).toBe(MAC)
  })

  it('is said by the next snapshot when an answer to an action brought it', () => {
    const answered = withAccount(started, withEnded([mac]).account!)
    const done = { ...answered, message: 'Home PC was denied.' }
    expect(applyWorkspaceSnapshot(done, withEnded([mac]), 2).message).toBe(MAC)
  })
})
