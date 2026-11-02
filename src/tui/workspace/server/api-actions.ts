import { setupPreparing } from '../setup/download-pending.js'
import { serverRunning } from '../navigation/sidebar.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceState } from '../state.js'
import { apiDownloadWait, inferenceReadiness } from '../../../workspace-view/index.js'
export async function apiAction(id: string, ctx: ActionContext): Promise<boolean> {
  const s = ctx.get(),
    controller = ctx.controller
  const patch = (p: Partial<WorkspaceState>) => ctx.update((v) => ({ ...v, ...p }))
  if (id === 'api-toggle') {
    if (s.apiPending) return true
    const waiting = apiDownloadWait(s.workspace, setupPreparing(s))
    if (waiting) {
      patch({ message: waiting.message, downloadAttention: (s.downloadAttention ?? 0) + 1 })
      return true
    }
    if (serverRunning(s)) {
      patch({ overlay: 'stop', edit: '', focus: 'stop-confirm', hover: '' })
      return true
    }
    // The API serves without a model: what is still missing is said with the start, not instead of it.
    const readiness = inferenceReadiness(s.workspace)
    patch({
      apiPending: 'starting',
      message: 'Starting the API...',
      ...(readiness.waiting ? { downloadAttention: (s.downloadAttention ?? 0) + 1 } : {}),
    })
    try {
      await controller.api(true, !s.busy && !s.modelLoad)
      const workspace = await controller.runtime.snapshot()
      patch({ workspace })
      const current = inferenceReadiness(workspace)
      patch({ message: current.ready ? 'API started.' : `API started. ${current.message}` })
    } finally {
      patch({ apiPending: undefined })
    }
    return true
  }
  if (id === 'stop-confirm') {
    if (s.apiPending) return true
    patch({
      apiPending: 'stopping',
      message: 'Stopping the API...',
      overlay: null,
      focus: 'api-toggle',
      hover: '',
    })
    try {
      await controller.api(false)
      patch({ workspace: await controller.runtime.snapshot() })
      patch({ message: 'API stopped. The background server remains available.' })
    } finally {
      patch({ apiPending: undefined })
    }
    return true
  }
  return false
}
