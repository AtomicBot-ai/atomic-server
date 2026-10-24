import { applyWorkspaceSnapshot } from './shared-state.js'
import { advanceWaitingGame } from './waiting-game.js'
import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { WorkspaceController } from './controller.js'
import type { WorkspaceState } from './state.js'
import { WORKSPACE_OPERATIONS } from '../../contract/index.js'
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
    let live = true,
      pending = false
    update((s) => ({ ...s, operations: [...WORKSPACE_OPERATIONS] }))
    const poll = async () => {
      if (pending || !controller.current) return
      pending = true
      try {
        const workspace = await controller.current.runtime.snapshot()
        if (live) update((s) => applyWorkspaceSnapshot(s, workspace, Date.now()))
      } catch {
        if (live) update((s) => (s.workspace ? { ...s, workspace: null } : s))
      } finally {
        pending = false
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 2500)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [ready, controller, update])
}
