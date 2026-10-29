import type { WorkspaceSnapshot } from '../../contract/index.js'
import { connectionDownload } from './connection-model.js'

/** The server holds a model-ready email for the download the wait screen shows (`setup.reminder`). */
export function reminderSet(snapshot: WorkspaceSnapshot | null | undefined, model = ''): boolean {
  const reminder = snapshot?.reminder,
    job = connectionDownload(snapshot?.setups ?? [], model)
  if (!reminder || !job || !['waiting', 'queued'].includes(reminder.status)) return false
  const plan = (job['plan'] ?? {}) as Record<string, unknown>
  return (
    String(job['setup_id'] ?? job['id'] ?? '') === reminder.setup_id ||
    [job['model_id'], plan['model_id'], plan['repository'], plan['variant_id']].includes(reminder.model)
  )
}
