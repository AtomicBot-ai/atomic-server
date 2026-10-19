import { useEffect, useState } from 'react'
import { downloadRows } from './download-data'
import type { Workspace } from '../useWorkspace'
import { Action, Empty, Panel } from '../Controls'
import { bytes, record, text } from '../types'
import type { RecordValue } from '../types'

export function Downloads({ workspace: w }: { workspace: Workspace }) {
  const rows = downloadRows(w.snapshot?.setups ?? [], w.snapshot?.downloads ?? [])
  return (
    <Panel title="Downloads">
      {rows.length === 0 ? (
        <Empty>No downloads in progress.</Empty>
      ) : (
        rows.map((job, index) => (
          <Download key={text(job.id ?? job.task_id, String(index))} job={job} workspace={w} />
        ))
      )}
    </Panel>
  )
}
function Download({ job, workspace: w }: { job: RecordValue; workspace: Workspace }) {
  const progress = record(job.progress)
  const [sample, setSample] = useState({ bytes: Number(job.transferred || 0), at: Date.now(), speed: 0 })
  useEffect(() => {
    const current = Number(job.transferred || 0),
      at = Date.now()
    setSample((previous) => {
      const elapsed = (at - previous.at) / 1000
      return {
        bytes: current,
        at,
        speed: elapsed >= 1 && current > previous.bytes ? (current - previous.bytes) / elapsed : 0,
      }
    })
  }, [job.transferred])
  const size = Number(progress.total_bytes ?? job.total_bytes ?? job.total ?? 0)
  const transferred = Number(
    progress.downloaded_bytes ?? progress.downloaded ?? job.downloaded_bytes ?? job.transferred ?? 0
  )
  const fraction = Number(progress.fraction ?? job.fraction ?? (size > 0 ? transferred / size : -1))
  const percent = fraction >= 0 ? Math.min(100, fraction * 100) : undefined
  const id = text(job.id ?? job.setup_id ?? job.task_id, '')
  const state = text(job.state ?? job.stage ?? job.status ?? job.phase, 'Queued')
  const model = record(job.model)
  const media = Boolean(job.category || job.artifact_id || record(job.plan).category)
  const ready = ['ready', 'complete', 'completed'].includes(state)
  const failed = ['failed', 'cancelled', 'interrupted', 'paused'].includes(state)
  const speed = progress.bytes_per_second ?? job.bytes_per_second ?? sample.speed
  const eta =
    progress.eta_seconds ??
    job.eta_seconds ??
    (Number(speed) > 0 && size > transferred ? (size - transferred) / Number(speed) : undefined)
  return (
    <article className="download-row">
      <div className="download-heading">
        <strong>
          {text(job.model_id ?? record(job.plan).model_id ?? model.id ?? job.filename ?? job.name ?? id)}
        </strong>
        <span>{state}</span>
      </div>
      <progress aria-label="Download progress" value={percent} max={100} />
      <div className="download-detail">
        <small>
          {size ? `${bytes(transferred)} / ${bytes(size)}` : 'Size pending'}
          {speed ? ` · ${bytes(speed)}/s` : ''}
          {eta !== undefined && eta !== null
            ? ` · ${Number(eta) < 60 ? Math.ceil(Number(eta)) + ' sec' : Math.ceil(Number(eta) / 60) + ' min'} remaining`
            : ''}
        </small>
        <div className="ew-actions">
          {job.owner === 'download' ? null : (
            <>
              {ready ? (
                <Action
                  onClick={() =>
                    media
                      ? w.execute('artifacts.load', { id })
                      : w.execute('models.load', {
                          provider: text(job.provider ?? record(job.plan).provider, 'llamacpp-upstream'),
                          model_id: text(job.model_id ?? record(job.plan).model_id),
                        })
                  }
                >
                  Load
                </Action>
              ) : failed ? (
                <Action
                  onClick={() =>
                    w.execute(media ? 'artifacts.resume' : 'setup.resume', media ? { id } : { setup_id: id })
                  }
                >
                  Resume
                </Action>
              ) : (
                <Action
                  onClick={() =>
                    w.execute(media ? 'artifacts.cancel' : 'setup.cancel', media ? { id } : { setup_id: id })
                  }
                >
                  Cancel
                </Action>
              )}
            </>
          )}
        </div>
      </div>
      {Boolean(job.error) && (
        <p role="alert" className="inline-error">
          {typeof job.error === 'object' ? text(record(job.error).message) : text(job.error)}
        </p>
      )}
    </article>
  )
}
