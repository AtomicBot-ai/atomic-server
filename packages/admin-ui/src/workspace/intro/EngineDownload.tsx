import { engineName, engineProgress, formatSize } from '@view'
import type { EngineProgress } from '@view'
import { useEffect, useState } from 'react'

export function EngineDownload({
  engine,
  taskId,
  downloads,
}: {
  engine: string
  taskId: string
  downloads: unknown[]
}) {
  const [last, setLast] = useState<{ taskId: string; progress: EngineProgress } | null>(null)
  const active = downloads.some(
    (item) => item && typeof item === 'object' && (item as { taskId?: string }).taskId === taskId
  )
  useEffect(() => {
    if (active) setLast({ taskId, progress: engineProgress(downloads, taskId) })
  }, [downloads, taskId, active])
  const progress =
    !active && last?.taskId === taskId
      ? { ...last.progress, status: 'Installing' }
      : engineProgress(downloads, taskId)
  return (
    <section className="engine-download" aria-label="Engine download">
      <strong>{engineName(engine)}</strong>
      <span>{progress.percent === null ? progress.status + '…' : `${progress.percent}%`}</span>
      <progress
        aria-label={`${engineName(engine)} download`}
        max={100}
        value={progress.percent ?? undefined}
      />
      <small role="status">
        {progress.status}
        {progress.total > 0 && ` · ${formatSize(progress.transferred)} / ${formatSize(progress.total)}`}
      </small>
    </section>
  )
}
