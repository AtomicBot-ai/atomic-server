import { downloadRows } from '../../workspace-view/index.js'
import type { WorkspaceSnapshot } from '../../contract/index.js'
export interface TransferSample {
  bytes: number
  at: number
  speed: number
}
export function sampleDownloads(
  previous: Record<string, TransferSample>,
  snapshot: WorkspaceSnapshot,
  now: number
) {
  return Object.fromEntries(
    downloadRows(snapshot.setups, snapshot.downloads).map((job) => {
      const old = previous[job.id],
        elapsed = old ? (now - old.at) / 1000 : 0
      const speed =
        old && elapsed > 0 && job.transferred > old.bytes ? (job.transferred - old.bytes) / elapsed : 0
      return [job.id, { bytes: job.transferred, at: now, speed }]
    })
  )
}
