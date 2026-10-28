import { sameEndpoint } from '../../../terminal-service/index.js'
import { inferenceReadiness, setupModelPending } from '../../../workspace-view/index.js'
import type { WorkspaceState } from '../state.js'

/** Remote endpoints have their own readiness; the shared snapshot describes this server only. */
export function chatReadiness(s: WorkspaceState) {
  if (s.modelLoad?.model === s.model)
    return {
      ready: false,
      waiting: true,
      message: 'The model is loading. Wait until it is ready.',
      acquire: null,
    }
  if (s.loadError?.model === s.model)
    return {
      ready: false,
      waiting: false,
      message: 'The model could not load. Choose a model to retry.',
      acquire: null,
    }
  const local = s.workspace?.api.endpoint
  const remote = !s.endpointFollowsServer && Boolean(local && s.endpoint && !sameEndpoint(s.endpoint, local))
  const readiness = inferenceReadiness(s.workspace, { model: s.model, kind: 'chat', requireApi: true })
  if (!s.model.trim())
    return !remote && !readiness.ready
      ? readiness
      : { ready: false, waiting: false, message: 'Choose a model to continue.', acquire: 'catalog' as const }
  // A model this server is still downloading is not sent anywhere: an endpoint typed in by hand can
  // name this server by another address (`localhost`, a LAN address) and still be it.
  if (remote && s.workspace && setupModelPending(s.workspace, s.model)) return readiness
  return remote ? null : readiness
}
export function readinessPatch(s: WorkspaceState): Partial<WorkspaceState> | null {
  const readiness = chatReadiness(s)
  if (!readiness || readiness.ready) return null
  return {
    message: readiness.message,
    ...(readiness.waiting && !s.modelLoad ? { downloadAttention: (s.downloadAttention ?? 0) + 1 } : {}),
    ...(!readiness.waiting && readiness.acquire
      ? readiness.acquire === 'server'
        ? { page: 'server', serverView: 'overview', focus: 'api-toggle' }
        : {
            page: 'models',
            libraryView: readiness.acquire === 'downloads' ? 'downloads' : 'catalog',
            focus: 'library-refresh',
          }
      : {}),
  }
}
