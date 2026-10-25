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
/** Background cards show active work; the Downloads page also retains completed jobs. */
export function downloadRows(
  setups: readonly unknown[],
  transfers: readonly unknown[],
  includeCompleted = false
): DownloadRow[] {
  const downloads = transfers
      .map(record)
      .sort((a, b) => Number(b['kind'] === 'engine') - Number(a['kind'] === 'engine')),
    used = new Set<string>(),
    result: DownloadRow[] = []
  for (const job of setups.map(record)) {
    const id = String(job['id'] ?? job['setup_id'] ?? ''),
      plan = record(job['plan']),
      ids = [id, ...Object.values(record(job['task_ids'])).map(String)].filter(Boolean),
      matching = downloads.filter((transfer) => ids.includes(taskId(transfer))),
      phase = state(job),
      progressPhase = ['paused', 'cancelled', 'failed', 'interrupted'].includes(phase)
        ? String(job['stopped_at'] ?? phase)
        : phase
    // Consume child transfers before omitting a completed parent. A stale last progress
    // event must not reappear as a separate download after verification succeeds.
    matching.forEach((transfer) => used.add(taskId(transfer)))
    if (completed.has(phase) && !includeCompleted) continue
    // A GGUF or media plan counts `total_download_bytes`; a store or Foundry Local plan `download_bytes`.
    const size = Number(
      plan['total_download_bytes'] ?? plan['total_bytes'] ?? plan['download_bytes'] ?? total(job)
    )
    let done = matching.length
      ? matching.reduce((sum, transfer) => sum + transferred(transfer), 0)
      : transferred(job)
    // A stopped GGUF setup retains the active transfer's bytes. Earlier stages
    // are still complete; pausing must not make the model or engine disappear.
    if (progressPhase === 'downloading_model') done += Number(record(plan['engine'])['download_size'] ?? 0)
    if (progressPhase === 'downloading_projector')
      done +=
        Number(record(plan['engine'])['download_size'] ?? 0) + Number(record(plan['model'])['size'] ?? 0)
    if (['verifying', 'registering'].includes(progressPhase) || completed.has(phase)) done = size
    result.push({
      ...job,
      id,
      // What both lists name the row by: a store job's repository, a Foundry Local job's variant.
      model_id: job['model_id'] ?? plan['variant_id'] ?? plan['repository'] ?? plan['model_id'],
      total: size,
      transferred: done,
      state: phase || 'queued',
      completed: completed.has(phase),
      owner: plan['category'] ? 'artifacts' : 'setup',
    })
  }
  for (const transfer of downloads) {
    const id = taskId(transfer),
      phase = state(transfer),
      size = total(transfer),
      done = transferred(transfer)
    if (used.has(id)) continue
    if (id) used.add(id)
    if (
      (completed.has(phase) && !(includeCompleted && transfer['kind'] === 'engine')) ||
      (!phase && size > 0 && done >= size)
    )
      continue
    result.push({
      ...transfer,
      id,
      state: phase || 'downloading',
      total: size,
      transferred: done,
      owner: 'download',
      completed: completed.has(phase),
    })
  }
  return includeCompleted
    ? result.sort((a, b) => Number(a['completed'] === true) - Number(b['completed'] === true))
    : result
}

/** Keep the current transfer visible while retaining stopped jobs in the queue. */
export function prioritizeDownloads(rows: readonly DownloadRow[]): DownloadRow[] {
  const rank = (row: DownloadRow) =>
    /failed|interrupted|cancelled/.test(row.state)
      ? 3
      : /paused/.test(row.state)
        ? 2
        : /queued/.test(row.state)
          ? 1
          : 0
  return [...rows].sort((a, b) => rank(a) - rank(b))
}
