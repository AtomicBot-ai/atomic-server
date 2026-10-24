import { downloadRows, prioritizeDownloads } from '../../workspace-view/index.js'
import type { WorkspaceState } from './state.js'
import type { Canvas } from './draw/canvas.js'

export function workspaceDownloadRows(s: WorkspaceState) {
  const progress = s.setup?.progress
  const setups = [...(s.workspace?.setups ?? [])] as Record<string, unknown>[]
  const transfers = [...(s.workspace?.downloads ?? [])] as Record<string, unknown>[]
  // Setup polls return before the general workspace poll. Keep their accepted model jobs
  // visible through the engine handoff; a newer shared record always wins.
  for (const job of progress?.jobs ?? []) {
    const index = setups.findIndex((row) => row['setup_id'] === job.setup_id)
    if (index < 0) setups.push({ ...job })
    else if (Number(setups[index]!['updated_at']) < job.updated_at) setups[index] = { ...job }
  }
  for (const transfer of progress?.transfers ?? [])
    if (!transfers.some((row) => row['taskId'] === transfer.taskId)) transfers.push({ ...transfer })
  const rows = downloadRows(setups, transfers)
  const view = s.setup,
    pending = view?.path?.job,
    selection = view?.selections[0],
    registered =
      Boolean(progress?.jobs.length) ||
      setups.some((job) =>
        pending ? job['id'] === pending.id : selection && job['request_id'] === selection.requestId
      )
  if (view && ['download', 'review'].includes(view.stage) && !progress?.ready && !registered) {
    const name = pending?.model ?? selection?.plan.model_id ?? view.pending?.repo ?? view.repository
    if (name && (pending || s.page !== 'setup'))
      rows.push({
        id: pending?.id ?? `preparing-${view.startedAt}`,
        owner: pending ? 'setup' : 'download',
        pending: !pending,
        model_id: name,
        state: view.error ? 'failed' : pending ? 'queued' : 'preparing',
        total: selection?.plan.total_download_bytes ?? 0,
        transferred: 0,
      })
  }
  return prioritizeDownloads(rows)
}

/** The status card shares the header, leaving every page's actions unobstructed. */
export function floatingDownloadBounds(c: Canvas, s: WorkspaceState) {
  if (!workspaceDownloadRows(s).length) return null
  const stacked = c.width < 80
  const width = stacked ? c.width - 4 : Math.min(56, c.width - 38)
  return {
    x: c.width - width - 2,
    y: c.height < 24 ? 2 : stacked ? 6 : 1,
    width,
    height: c.height < 24 ? 4 : 5,
  }
}

export function downloadContentBottom(c: Canvas, _s: WorkspaceState) {
  return c.height - 4
}
