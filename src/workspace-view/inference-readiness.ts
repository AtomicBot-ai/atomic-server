import type { WorkspaceSnapshot } from '../contract/index.js'
import { connectionDownload, connectionDownloadTarget } from './connection-model.js'
import { downloadRows } from './downloads.js'

export interface InferenceReadiness {
  ready: boolean
  waiting: boolean
  message: string
  acquire: 'catalog' | 'engines' | 'downloads' | 'server' | null
}
/** A downloaded file or a running management process is not a ready inference session. */
export function inferenceReadiness(
  snapshot: WorkspaceSnapshot | null | undefined,
  options: { model?: string; provider?: string; kind?: string; requireApi?: boolean } = {}
): InferenceReadiness {
  const blocked = (message: string, acquire: InferenceReadiness['acquire'], waiting = false) => ({
    ready: false,
    waiting,
    message,
    acquire,
  })
  if (!snapshot) return blocked('Checking model readiness…', null, true)
  const services = snapshot.services.filter(
    (service) =>
      (!options.model || service.model === options.model) &&
      (!options.provider || service.provider === options.provider) &&
      (!options.kind || service.kind === options.kind)
  )
  if (services.some((service) => ['ready', 'loaded', 'running'].includes(service.state))) {
    if (options.requireApi && !snapshot.api.running)
      return blocked('Start the server to send a message.', 'server')
    return { ready: true, waiting: false, message: '', acquire: null }
  }
  if (
    services.some((service) => /loading|preparing|starting/.test(service.state)) ||
    (snapshot.loads ?? []).some((load) => !options.model || load.model_id === options.model)
  )
    return blocked('The model is loading. Wait until it is ready.', null, true)
  const job = connectionDownload(snapshot.setups, options.model),
    target = connectionDownloadTarget(job),
    downloads = downloadRows(snapshot.setups, snapshot.downloads),
    model = downloads.find((row) => row.id === String(job?.['id'] ?? job?.['setup_id'] ?? '')),
    engine = downloads.find((row) => row.owner === 'download')
  if (model) {
    const paused = /paused|cancelled|failed|interrupted/.test(model.state)
    return blocked(
      paused
        ? 'Resume the model download to continue.'
        : model.state.includes('engine')
          ? 'The engine is downloading. Wait until it is ready.'
          : 'The model is downloading. Wait until it is ready.',
      'downloads',
      !paused
    )
  }
  if (engine) {
    const paused = /paused|cancelled|failed|interrupted/.test(engine.state)
    return blocked(
      paused
        ? engine['kind'] === 'engine'
          ? 'Retry the engine download to continue.'
          : 'Resume the engine download to continue.'
        : 'The engine is downloading. Wait until it is ready.',
      'downloads',
      !paused
    )
  }
  if (target.model) return blocked('Load the downloaded model to continue.', 'catalog')
  return blocked('Choose and download a model to continue.', 'catalog')
}

/** Final onboarding waits for its selected text download, not optional media jobs. */
export function setupModelPending(snapshot: WorkspaceSnapshot | null | undefined, model = '') {
  const job = connectionDownload(snapshot?.setups ?? [], model)
  return Boolean(
    job &&
    !['ready', 'complete', 'completed', 'succeeded', 'success', 'done', 'removed', 'deleted'].includes(
      String(job['stage'] ?? job['state'] ?? '')
    )
  )
}
