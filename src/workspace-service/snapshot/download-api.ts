import type { WorkspaceSnapshot } from '../../contract/index.js'
import { apiDownloadWait } from '../../workspace-view/index.js'

const installs = new Set([
  'engines.enqueue',
  'engines.install',
  'engines.retry',
  'models.install',
  'setup.resume',
  'managed.install',
  'managed.resume',
  'foundry.install',
  'foundry.resume',
  'litert.install',
  'geniex.install',
  'litert.resume',
])
/** Stop only an empty listener when its first model/engine download begins. Live models keep serving. */
export async function suspendDownloadingApi(
  operation: string,
  snapshot: () => Promise<WorkspaceSnapshot>,
  stop: () => Promise<unknown>
) {
  if (!installs.has(operation)) return
  const state = await snapshot()
  if (state.api.running && apiDownloadWait(state)) await stop()
}
