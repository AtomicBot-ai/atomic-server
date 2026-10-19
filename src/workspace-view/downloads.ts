type Row = Record<string, unknown>
export interface DownloadRow extends Row {
  id: string
  state: string
  total: number
  transferred: number
  owner: 'setup' | 'artifacts' | 'download'
}
const completed = new Set(['ready', 'complete', 'completed', 'succeeded', 'success', 'done'])
function record(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {}
}
function state(row: Row): string {
  return String(row['stage'] ?? row['state'] ?? row['status'] ?? row['phase'] ?? '').toLowerCase()
}
function taskId(row: Row): string {
  return String(row['taskId'] ?? row['task_id'] ?? row['id'] ?? '')
}
function transferred(row: Row): number {
  const progress = record(row['progress'])
  return Number(
    row['transferred'] ??
      row['downloadedBytes'] ??
      row['downloaded_bytes'] ??
      progress['downloadedBytes'] ??
      progress['downloaded_bytes'] ??
      0
  )
}
function total(row: Row): number {
  const progress = record(row['progress'])
  return Number(
    row['total'] ??
      row['totalBytes'] ??
      row['total_bytes'] ??
      progress['totalBytes'] ??
      progress['total_bytes'] ??
      0
  )
}
/** Hide successful jobs without deleting their installation records or downloaded files. */
export function downloadRows(setups: readonly unknown[], transfers: readonly unknown[]): DownloadRow[] {
  const downloads = transfers.map(record),
    used = new Set<string>(),
    result: DownloadRow[] = []
  for (const job of setups.map(record)) {
    const id = String(job['id'] ?? job['setup_id'] ?? ''),
      plan = record(job['plan']),
      ids = [id, ...Object.values(record(job['task_ids'])).map(String)].filter(Boolean),
      matching = downloads.filter((transfer) => ids.includes(taskId(transfer))),
      phase = state(job)
    // Consume child transfers before omitting a completed parent. A stale last progress
    // event must not reappear as a separate download after verification succeeds.
    matching.forEach((transfer) => used.add(taskId(transfer)))
    if (completed.has(phase)) continue
    const size = Number(plan['total_download_bytes'] ?? plan['total_bytes'] ?? total(job))
    let done = matching.length
      ? matching.reduce((sum, transfer) => sum + transferred(transfer), 0)
      : transferred(job)
    if (phase === 'downloading_model') done += Number(record(plan['engine'])['download_size'] ?? 0)
    if (phase === 'downloading_projector')
      done +=
        Number(record(plan['engine'])['download_size'] ?? 0) + Number(record(plan['model'])['size'] ?? 0)
    if (['verifying', 'registering'].includes(phase)) done = size
    result.push({
      ...job,
      id,
      total: size,
      transferred: done,
      state: phase || 'queued',
      owner: plan['category'] ? 'artifacts' : 'setup',
    })
  }
  for (const transfer of downloads) {
    const id = taskId(transfer),
      phase = state(transfer),
      size = total(transfer),
      done = transferred(transfer)
    if (used.has(id) || completed.has(phase) || (!phase && size > 0 && done >= size)) continue
    if (id) used.add(id)
    result.push({
      ...transfer,
      id,
      state: phase || 'downloading',
      total: size,
      transferred: done,
      owner: 'download',
    })
  }
  return result
}
