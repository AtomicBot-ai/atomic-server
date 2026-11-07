import { engineProgress, formatSize } from '@view'

import { installationLabel } from './installation-label'
import type { EngineInstallation } from './installation-label'

export function EngineInstallProgress({
  installation,
  downloads,
}: {
  installation: EngineInstallation | null
  downloads: readonly unknown[]
}) {
  if (!installation) return null
  const progress = engineProgress(downloads, installation.taskId)
  const downloading =
    installation.stage !== 'preparing' &&
    (!installation.phase || ['connecting', 'downloading'].includes(installation.phase))
  return (
    <div className="engine-install-progress" role="status" aria-live="polite">
      <p className="engine-progress-title">{installationLabel(installation)}</p>
      <progress
        aria-label="Engine installation"
        max={100}
        value={downloading ? (progress.percent ?? undefined) : undefined}
      />
      {downloading && progress.total > 0 && (
        <p className="ew-muted">
          {progress.percent}% · {formatSize(progress.transferred)} / {formatSize(progress.total)}
        </p>
      )}
      <p className="ew-muted">Installation continues if you close this window.</p>
    </div>
  )
}
