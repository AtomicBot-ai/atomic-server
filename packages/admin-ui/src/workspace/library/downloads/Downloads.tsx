import { downloadEta, downloadHeld, downloadOwner, formatEta } from '@view'
import { useDownloadEstimate } from './useDownloadEstimate'
import { DeleteConfirmation } from '../DeleteConfirmation'
import { useState } from 'react'
import { downloadRows, jobOperations } from './download-data'
import type { Workspace } from '../../useWorkspace'
import { Action, Empty } from '../../Controls'
import { bytes, record, text } from '../../types'
import type { RecordValue } from '../../types'

export function Downloads({
  workspace: w,
  showTitle = true,
  compact = false,
  excludeMedia = false,
}: {
  workspace: Workspace
  showTitle?: boolean
  compact?: boolean
  excludeMedia?: boolean
}) {
  const rows = downloadRows(w.snapshot?.setups ?? [], w.snapshot?.downloads ?? [], !compact).filter(
    (job) =>
      !excludeMedia ||
      !['image', 'video', 'audio'].includes(text(record(job.plan).category ?? job.category, ''))
  )
  if (compact && !rows.length) return null
  return (
    <section className={`ew-panel${compact ? ' compact-downloads' : ''}`} aria-label="Downloads">
      {showTitle && (
        <div className="panel-heading">
          <h2>Downloads</h2>
        </div>
      )}
      {rows.length === 0 ? (
        <Empty>No downloads yet.</Empty>
      ) : (
        rows.map((job, index) => (
          <Download key={text(job.id ?? job.task_id, String(index))} job={job} workspace={w} />
        ))
      )}
    </section>
  )
}
function Download({ job, workspace: w }: { job: RecordValue; workspace: Workspace }) {
  const [removing, setRemoving] = useState(false)
  const progress = record(job.progress)
  const completed = job.completed === true
  const { speed } = useDownloadEstimate(job)
  const size = Number(progress.total_bytes ?? job.total_bytes ?? job.total ?? 0)
  const transferred = completed
    ? size
    : Number(progress.downloaded_bytes ?? progress.downloaded ?? job.downloaded_bytes ?? job.transferred ?? 0)
  const fraction = Number(progress.fraction ?? job.fraction ?? (size > 0 ? transferred / size : -1))
  const percent = completed ? 100 : fraction >= 0 ? Math.min(100, fraction * 100) : undefined
  const id = text(job.id ?? job.setup_id ?? job.task_id, '')
  const state = text(job.state ?? job.stage ?? job.status ?? job.phase, 'Queued')
  const model = record(job.model)
  const media = Boolean(job.category || job.artifact_id || record(job.plan).category)
  const failed = ['failed', 'cancelled', 'interrupted', 'paused'].includes(state)
  const eta = downloadEta({ ...job, total: size, transferred }, speed)
  const name = text(
    job.model_id ??
      record(job.plan).name ??
      record(job.plan).model_id ??
      model.id ??
      job.filename ??
      job.name ??
      id
  )
  return (
    <article className="download-row">
      <div className="download-heading">
        <strong>{name}</strong>
        <span>{completed ? 'Downloaded' : downloadHeld(state) ? 'Paused' : state.replaceAll('_', ' ')}</span>
      </div>
      <progress aria-label="Download progress" value={percent} max={100} />
      <div className="download-detail">
        <small>
          {size ? `${bytes(transferred)} / ${bytes(size)}` : 'Size pending'}
          {!completed && !failed && speed ? ` · ${bytes(speed)}/s` : ''}
          {!completed && !failed && eta !== undefined && eta !== null ? ` · ${formatEta(eta)} remaining` : ''}
        </small>
        <div className="ew-actions">
          {job.kind === 'engine' && failed && (
            <>
              <Action primary onClick={() => w.execute('engines.retry', { id })}>
                Retry
              </Action>
              <Action
                title={`Dismiss ${name}`}
                ariaLabel={`Dismiss ${name}`}
                onClick={() => w.execute('engines.dismiss', { id })}
              >
                ×
              </Action>
            </>
          )}
          {job.owner === 'download' ? null : (
            <>
              {completed ? null : failed ? (
                <Action
                  primary
                  onClick={() => {
                    const [name, input] = jobOperations(job, id, media).resume
                    return w.execute(name, input)
                  }}
                >
                  Resume
                </Action>
              ) : (
                <Action
                  onClick={() => {
                    const [name, input] = jobOperations(job, id, media).cancel
                    return w.execute(name, input)
                  }}
                >
                  Pause
                </Action>
              )}
              <Action
                title={`${completed ? 'Delete model' : 'Remove download'} ${name}`}
                ariaLabel={`${completed ? 'Delete model' : 'Remove download'} ${name}`}
                danger
                onClick={() => setRemoving(true)}
              >
                ×
              </Action>
            </>
          )}
        </div>
      </div>
      {Boolean(job.error) && (
        <p role="alert" className="inline-error">
          {typeof job.error === 'object' ? text(record(job.error).message) : text(job.error)}
        </p>
      )}
      {removing && (
        <DeleteConfirmation
          title={completed ? 'Delete model?' : 'Remove download?'}
          name={name}
          detail={
            completed
              ? 'Downloaded files will be deleted. Unload the model before deleting it.'
              : 'The download will stop and its partial files will be deleted. Shared files are kept.'
          }
          confirm={completed ? 'Delete model' : 'Remove download'}
          onClose={() => setRemoving(false)}
          onConfirm={() =>
            w.execute('downloads.remove', {
              id,
              owner: downloadOwner(job),
              ...(completed ? { installed: true } : {}),
            })
          }
        />
      )}
    </article>
  )
}
