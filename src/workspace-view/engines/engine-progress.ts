export interface EngineProgress {
  transferred: number
  total: number
  percent: number | null
  status: string
}
/** Match the install's task, never an unrelated concurrent model download. */
export function engineProgress(transfers: readonly unknown[], taskId: string): EngineProgress {
  const row = transfers.find(
    (value) => value && typeof value === 'object' && (value as { taskId?: string }).taskId === taskId
  ) as { transferred?: number; total?: number } | undefined
  const transferred = Math.max(0, Number(row?.transferred) || 0)
  const total = Math.max(0, Number(row?.total) || 0)
  return {
    transferred: total ? Math.min(total, transferred) : transferred,
    total,
    percent: total ? Math.min(100, Math.floor((transferred / total) * 100)) : null,
    status:
      total && transferred >= total ? 'Installing' : transferred || total ? 'Downloading' : 'Connecting',
  }
}
