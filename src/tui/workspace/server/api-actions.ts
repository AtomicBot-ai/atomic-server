import { serverRunning } from '../navigation/sidebar.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceState } from '../state.js'
import { inferenceReadiness } from '../../../workspace-view/index.js'
export async function apiAction(id: string, ctx: ActionContext): Promise<boolean> {
  const s = ctx.get(),
    controller = ctx.controller
  const patch = (p: Partial<WorkspaceState>) => ctx.update((v) => ({ ...v, ...p }))
  if (id === 'api-toggle') {
    if (s.busy) return true
    if (serverRunning(s)) {
      patch({ overlay: 'stop', edit: '', focus: 'close' })
      return true
    }
    // The API serves without a model: what is still missing is said with the start, not instead of it.
    const readiness = inferenceReadiness(s.workspace)
    patch({
      busy: true,
      message: 'Starting the API...',
      ...(readiness.waiting ? { downloadAttention: (s.downloadAttention ?? 0) + 1 } : {}),
    })
    try {
      await controller.api(true)
      patch({ message: readiness.ready ? 'API started.' : `API started. ${readiness.message}` })
    } finally {
      patch({ busy: false })
    }
    return true
  }
  if (id === 'stop-confirm') {
    patch({ busy: true, message: 'Stopping the API...', overlay: null })
    try {
      await controller.api(false)
      patch({ message: 'API stopped. The background server remains available.' })
    } finally {
      patch({ busy: false })
    }
    return true
  }
  return false
}
