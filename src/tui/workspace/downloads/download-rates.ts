import { downloadRows, nextTransferSample } from '../../../workspace-view/index.js'
import type { TransferSample } from '../../../workspace-view/index.js'
import type { WorkspaceSnapshot } from '../../../contract/index.js'
export type { TransferSample } from '../../../workspace-view/index.js'
export function sampleDownloads(
  previous: Record<string, TransferSample>,
  snapshot: WorkspaceSnapshot,
  now: number
) {
  return Object.fromEntries(
    downloadRows(snapshot.setups, snapshot.downloads).map((job) => [
      job.id,
      nextTransferSample(previous[job.id], job.id, job.transferred, now),
    ])
  )
}
