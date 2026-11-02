import { setupDownloadsPending } from '../../../workspace-view/index.js'
import type { WorkspaceState } from '../state.js'

/** File lookup and planning start before the server has a download job to publish. */
export function setupPreparing(s: WorkspaceState) {
  return Boolean(s.setup?.preparing || (s.setup?.busy && s.firstModelChoice))
}

export function firstRunDownloadsPending(s: WorkspaceState, snapshot = s.workspace) {
  return setupDownloadsPending(snapshot, setupPreparing(s))
}
