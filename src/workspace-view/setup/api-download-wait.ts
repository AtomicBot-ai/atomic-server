/** A pending first model cannot expose a usable API, even if an old empty listener is running. */
import type { WorkspaceSnapshot } from '../../contract/index.js'
import { downloadRows } from '../downloads/downloads.js'
import { downloadStopped } from '../downloads/download-controls.js'

export function apiDownloadWait(snapshot: Partial<WorkspaceSnapshot> | null | undefined, preparing = false) {
  if (snapshot?.services?.some((s) => s.kind === 'chat' && ['ready', 'loaded', 'running'].includes(s.state)))
    return null
  if (preparing)
    return {
      label: 'Model is preparing...',
      message: 'Wait for the model download to finish before starting the API.',
    }
  if (!snapshot) return null
  // Fold every setup's transfers first, so an optional media child cannot look like a text download.
  const rows = downloadRows(snapshot.setups ?? [], snapshot.downloads ?? []).filter(
      (r) => !['removed', 'deleted'].includes(r.state)
    ),
    model = rows.find((r) => {
      const plan = r['plan'] as Record<string, unknown> | undefined
      return (
        r['kind'] !== 'engine' &&
        !['image', 'video', 'audio'].includes(String(plan?.['category'] ?? r['category'] ?? ''))
      )
    }),
    engine = rows.find((r) => r['kind'] === 'engine'),
    pending = model ?? engine
  if (!pending) return null
  const enginePending = pending === engine || /engine/.test(pending.state),
    name = enginePending ? 'Engine' : 'Model',
    stopped = downloadStopped(pending.state)
  return {
    label: stopped ? `${name} download paused` : `${name} is downloading...`,
    message: stopped
      ? `Resume the ${name.toLowerCase()} download to continue.`
      : `Wait for the ${name.toLowerCase()} to download before starting the API.`,
  }
}
