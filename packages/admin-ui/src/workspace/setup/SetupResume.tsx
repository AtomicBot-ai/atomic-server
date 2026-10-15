import { Action } from '../Controls'
import { record, text } from '../types'
import type { RecordValue } from '../types'

export function SetupResume({
  jobs,
  onResume,
}: {
  jobs: RecordValue[]
  onResume: (job: RecordValue) => void
}) {
  if (!jobs.length) return null
  return (
    <details className="setup-resume">
      <summary>Continue an existing download</summary>
      {jobs.map((job) => (
        <div className="installed-row" key={text(job.id ?? job.setup_id)}>
          <span>
            {text(record(job.plan).model_id ?? job.model_id ?? job.id)} · {text(job.stage)}
          </span>
          <Action onClick={() => onResume(job)}>Continue this setup</Action>
        </div>
      ))}
    </details>
  )
}
