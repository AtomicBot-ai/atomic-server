import { useState } from 'react'
import { Action } from '../Controls'
import { FirstModel } from '../setup/FirstModel'
import { ModelInstall } from '../library/ModelInstall'
import { record, text } from '../types'
import type { RecordValue } from '../types'
import type { Workspace } from '../useWorkspace'
import { useDialog } from '../useDialog'
import { connectionDownloadTarget } from '@view'

/** Keep the connection guide mounted while its model is changed. */
export function ConnectionModelPicker({
  workspace,
  onChoose,
  onClose,
}: {
  workspace: Workspace
  onChoose: (id: string, provider: string, job?: RecordValue) => void
  onClose: () => void
}) {
  const [review, setReview] = useState<RecordValue | null>(null)
  const dialog = useDialog(onClose)
  return (
    <div className="modal-shade">
      <section
        ref={dialog}
        tabIndex={-1}
        className="ew-modal connection-model-catalog"
        role="dialog"
        aria-modal="true"
        aria-label="Choose a model for this connection"
      >
        <div className="panel-heading">
          <h2>Choose a model</h2>
          <Action onClick={onClose}>Back to connection</Action>
        </div>
        <FirstModel
          workspace={workspace}
          select={(model, installed) => {
            if (installed)
              onChoose(
                text(model.id ?? model.model_id, ''),
                text(model.provider ?? (Array.isArray(model.providers) ? model.providers[0] : ''), '')
              )
            else setReview(model)
          }}
        />
        {review && (
          <ModelInstall
            autoStart
            model={review}
            category="text"
            execute={workspace.execute}
            onClose={() => setReview(null)}
            onStarted={(result) => {
              const job = record(result)
              const id = text(record(job.plan).model_id ?? job.model_id, '')
              if (!text(job.id ?? job.setup_id, '') || !id)
                throw new Error('The server did not return the selected model. Retry or check Downloads.')
              onChoose(id, connectionDownloadTarget(job).provider, { ...job, stage: job.stage ?? 'queued' })
            }}
          />
        )}
      </section>
    </div>
  )
}
