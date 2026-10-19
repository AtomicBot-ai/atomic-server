import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { WorkspaceController } from './controller.js'
import type { WorkspaceState } from './state.js'
import { WORKSPACE_OPERATIONS } from '../../contract/index.js'
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
        if (live)
          update((s) => ({ ...s, workspace, ...(workspace.setup?.complete ? { setupComplete: true } : {}) }))
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
