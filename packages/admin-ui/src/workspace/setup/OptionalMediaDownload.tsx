// Lifted from Atomic-Chat preview/onboarding/Onboarding.tsx @ 5043013; adapted: separate pause, retry and removal actions.
import { Check, Pause, Play, X } from 'lucide-react'
import { Action } from '../Controls'
import { jobOperations } from '../library/download-data'
import { bytes, text } from '../types'
import type { Execute, RecordValue } from '../types'

export function OptionalMediaDownload({
  job,
  name,
  execute,
  remove,
}: {
  job: RecordValue
  name: string
  execute: Execute
  remove: () => void
}) {
  const state = text(job.stage ?? job.state, 'queued')
  const ready = state === 'ready'
  const paused = /paused|cancelled/.test(state)
  const failed = /failed|interrupted/.test(state)
  const id = text(job.id ?? job.setup_id)
  const total = Number(job.total ?? 0),
    transferred = Number(job.transferred ?? 0),
    percent = total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0
  return (
    <div className="first-media-download">
      <span role="status">
        {ready ? (
          <>
            <Check size={14} aria-hidden="true" /> Downloaded
          </>
        ) : failed ? (
          'Download interrupted'
        ) : paused ? (
          'Paused'
        ) : state === 'queued' ? (
          'Queued'
        ) : (
          'Downloading'
        )}
      </span>
      {!ready && total > 0 && (
        <div className="first-media-progress">
          <progress aria-label={`${name} download`} value={percent} max={100} />
          <small>
            {percent}% · {bytes(transferred)} / {bytes(total)}
          </small>
        </div>
      )}
      <div className="ew-actions">
        {ready ? (
          <Action onClick={remove}>Delete model</Action>
        ) : (
          <>
            <Action
              primary={failed}
              onClick={() => {
                const operation = jobOperations(job, id, true)[paused || failed ? 'resume' : 'cancel']
                return execute(operation[0], operation[1])
              }}
            >
              {paused || failed ? (
                <Play size={14} aria-hidden="true" />
              ) : (
                <Pause size={14} aria-hidden="true" />
              )}
              {failed ? 'Retry' : paused ? 'Resume' : 'Pause'}
            </Action>
            <Action title={`Remove download ${name}`} ariaLabel={`Remove download ${name}`} onClick={remove}>
              <X size={14} aria-hidden="true" />
            </Action>
          </>
        )}
      </div>
    </div>
  )
}
