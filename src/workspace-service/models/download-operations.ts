/** The workspace's download operations: engine builds, GGUF setups, media artifacts and removal; `NOT_CORE` for any other. */

import type { WorkspaceInput, WorkspaceSnapshot } from '../../contract/index.js'
import type { EngineDownloads } from '../engines/engine-downloads.js'
import type { modelDownloads } from './model-downloads.js'
import type { WorkspaceServiceOptions } from '../service-options.js'
import { removeDownload } from './download-removal.js'
import { NOT_CORE } from '../not-core.js'

export interface DownloadParts {
  downloads: ReturnType<typeof modelDownloads>
  engines: EngineDownloads
  options: WorkspaceServiceOptions
  snapshot: () => Promise<Pick<WorkspaceSnapshot, 'services' | 'errors'>>
}

export function downloadOperation(
  { downloads, engines, options, snapshot }: DownloadParts,
  operation: string,
  input: WorkspaceInput
): Promise<unknown> | typeof NOT_CORE {
  const { setups, artifacts } = downloads
  switch (operation) {
    case 'engines.enqueue':
      return engines.enqueue(String(input['engine']), input)
    case 'engines.retry':
      return engines.retry(String(input['id']))
    case 'models.plan':
    case 'models.install':
    case 'setup.status':
    case 'setup.resume':
    case 'setup.cancel':
      return setups.operation(operation, input)
    case 'downloads.remove':
      return removeDownload(downloads, options, input, snapshot)
    case 'artifacts.plan':
      return artifacts.plan(input)
    case 'artifacts.install':
      return artifacts.install(input)
    case 'artifacts.list':
      return artifacts.list()
    case 'artifacts.resume':
      return artifacts.resume(String(input['id']))
    case 'artifacts.cancel':
      return artifacts.cancel(String(input['id']))
    case 'artifacts.load':
      return artifacts.load(String(input['id']))
  }
  return NOT_CORE
}
