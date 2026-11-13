import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { WORKSPACE_OPERATIONS } from '@contract'
import type { WorkspaceAccount, WorkspaceRemoteHost } from '@contract'
import type { Workspace } from '@/workspace/useWorkspace'
import type { Execute } from '@/workspace/types'
import { snapshotFixture } from './workspace-fixture'

/** A remote access host with sharing off and nobody paired, its fields overridable. */
export const remoteFixture = (patch: Partial<WorkspaceRemoteHost> = {}): WorkspaceRemoteHost => ({
  sharing: false,
  host_name: null,
  tunnel: 'off',
  lan: false,
  addresses: 0,
  pairing: null,
  requests: [],
  devices: [],
  error: null,
  ...patch,
})

/** `snapshot.account` with accounts on and nobody signed in, its fields overridable. */
export const accountFixture = (patch: Partial<WorkspaceAccount> = {}): WorkspaceAccount => ({
  enabled: true,
  signed_in: false,
  user: null,
  sign_in: { state: 'idle' },
  remote: remoteFixture(),
  ...patch,
})

type Update = (patch: Partial<WorkspaceAccount>) => void
type Answer = (input: Record<string, unknown>, update: Update) => unknown

/**
 * A workspace whose `snapshot.account` the operations change, as the server would before `execute`
 * resolves: `answer[name](input, update)` returns the result and may `update` the account. `Live` renders
 * its children with the current workspace, again after every change.
 */
export function liveAccount(initial: WorkspaceAccount, answer: Record<string, Answer> = {}) {
  let current = initial
  const listeners = new Set<() => void>()
  const update: Update = (patch) => {
    current = { ...current, ...patch }
    listeners.forEach((listener) => listener())
  }
  const execute = vi.fn(async (name: string, input: Record<string, unknown> = {}) =>
    answer[name] ? answer[name](input, update) : {}
  )
  const refresh = vi.fn(async () => null)
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  }
  const workspaceOf = (account: WorkspaceAccount): Workspace => ({
    snapshot: snapshotFixture({ account }),
    operations: [...WORKSPACE_OPERATIONS],
    execute: execute as unknown as Execute,
    loading: false,
    error: '',
    pending: [],
    refresh,
  })
  function Live({ children }: { children: (workspace: Workspace) => ReactNode }) {
    const account = useSyncExternalStore(subscribe, () => current)
    return <>{children(workspaceOf(account))}</>
  }
  return { execute, refresh, update, Live, workspace: () => workspaceOf(current) }
}
