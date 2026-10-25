import { pollEvery } from './poll.js'
import { applyWorkspaceSnapshot } from './shared-state.js'
import { advanceWaitingGame } from '../games/waiting-game.js'
import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { WorkspaceController } from '../controller.js'
import type { WorkspaceState } from '../state.js'
import { WORKSPACE_OPERATIONS } from '../../../contract/index.js'
import { AtcError } from '../../../errors/index.js'
export function useWaitingGame(
  s: WorkspaceState,
  update: (fn: (s: WorkspaceState) => WorkspaceState) => void
) {
  const playing =
    s.overlay === 'waiting-game' && s.waitingGame?.outcome === 'playing' && !s.waitingGame.paused
  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => update(advanceWaitingGame), 160)
    return () => clearInterval(timer)
  }, [playing, update])
}
export function useRuntimeData(
  ready: boolean,
  controller: RefObject<WorkspaceController | undefined>,
  update: (fn: (s: WorkspaceState) => WorkspaceState) => void
) {
  useEffect(() => {
    if (!ready) return
    update((s) => ({ ...s, operations: [...WORKSPACE_OPERATIONS] }))
    return pollEvery(
      2500,
      async (live) => {
        if (!controller.current) return
        try {
          const workspace = await controller.current.runtime.snapshot()
          if (live()) update((s) => applyWorkspaceSnapshot(s, workspace, Date.now()))
        } catch (error) {
          // A poll that failed while the server is busy keeps the last snapshot; only a server that is
          // gone takes it away, so downloads and models do not flicker out for a tick.
          const gone = error instanceof AtcError && error.code === 'ATC_DAEMON_NOT_RUNNING'
          if (live() && gone) update((s) => (s.workspace ? { ...s, workspace: null } : s))
        }
      },
      { immediately: true }
    )
  }, [ready, controller, update])
}
