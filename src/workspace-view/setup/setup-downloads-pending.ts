import type { WorkspaceSnapshot } from '../../contract/index.js'
import { downloadRows } from '../downloads/downloads.js'

/** Onboarding waits for the whole download queue, including standalone engines and preparation. */
export function setupDownloadsPending(
  snapshot: Partial<WorkspaceSnapshot> | null | undefined,
  preparing = false
) {
  return (
    !snapshot ||
    preparing ||
    downloadRows(snapshot?.setups ?? [], snapshot?.downloads ?? []).some(
      (row) => !['removed', 'deleted'].includes(row.state)
    )
  )
}
