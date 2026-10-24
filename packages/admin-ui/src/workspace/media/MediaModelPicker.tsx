// Lifted from atomic-chat-ui/web-app/src/containers/images/ImageModelPicker.tsx @ 807b4d9; adapted: daemon-owned artifacts and real load operations.
import { useEffect, useState } from 'react'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
import { useDialog } from '../useDialog'
import { modelCategory, modelId } from '../library/catalog-models'
import { describeError } from '@/services/admin-api'

export function MediaModelPicker({
  workspace,
  task,
  current,
  onClose,
  onCatalog,
}: {
  workspace: Workspace
  task: string
  current?: string
  onClose: () => void
  onCatalog: () => void
}) {
  const [models, setModels] = useState<RecordValue[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const ref = useDialog(() => {
    if (!pending) onClose()
  })
  const { execute } = workspace
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void execute('artifacts.list')
      .then((result) => {
        if (active)
          setModels(rows(result).filter((model) => model.stage === 'ready' && modelCategory(model) === task))
      })
      .catch((e) => {
        if (active) setError(describeError(e))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [execute, task, revision])
  return (
    <div className="modal-shade">
      <section
        ref={ref}
        className="ew-modal media-model-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Choose a model"
        aria-busy={Boolean(pending)}
        tabIndex={-1}
      >
        <div className="panel-heading">
          <h2>Choose a model</h2>
          <Action disabled={Boolean(pending)} onClick={onClose} ariaLabel="Close model picker">
            ×
          </Action>
        </div>
        {loading && <p role="status">Reading downloaded models…</p>}
        {error && (
          <p role="alert" className="ew-error">
            {error} <Action onClick={() => setRevision((v) => v + 1)}>Retry</Action>
          </p>
        )}
        {!loading && !error && !models.length && (
          <p>No {task === 'image' ? 'image' : 'video'} models downloaded.</p>
        )}
        <div className="media-model-list">
          {models.map((model) => (
            <div key={text(model.id)}>
              <span>
                <strong>{text(model.name ?? record(model.plan).name, modelId(model))}</strong>
                <small>{current === modelId(model) ? 'Loaded' : 'Downloaded'}</small>
              </span>
              <Action
                primary
                disabled={Boolean(pending) || current === modelId(model)}
                onClick={async () => {
                  setPending(text(model.id))
                  try {
                    await execute('artifacts.load', { id: model.id })
                    onClose()
                  } finally {
                    setPending('')
                  }
                }}
              >
                {pending === model.id ? 'Loading…' : current === modelId(model) ? 'Loaded' : 'Load model'}
              </Action>
            </div>
          ))}
        </div>
        <Action
          disabled={Boolean(pending)}
          onClick={() => {
            onClose()
            onCatalog()
          }}
        >
          Browse models
        </Action>
      </section>
    </div>
  )
}
