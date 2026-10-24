// Lifted from atomic-chat-ui/web-app/src/containers/images/ImagePromptForm.tsx and videos/VideoPromptForm.tsx @ 807b4d9; adapted: real workspace jobs and capability-backed controls.
import { useState } from 'react'
import { ChevronDown, RotateCcw, Square, WandSparkles } from 'lucide-react'
import { Action, Field, JsonResult } from '../Controls'
import { list, text } from '../types'
import type { RecordValue } from '../types'
import type { Workspace } from '../useWorkspace'
import { MediaParameters } from './MediaParameters'
import { MediaGallery } from './MediaGallery'
import { MediaModelPicker } from './MediaModelPicker'
import { DeleteConfirmation } from '../library/DeleteConfirmation'
import { describeError } from '@/services/admin-api'
import './media-studio.css'

export function MediaStudio({
  workspace,
  task,
  model,
  capabilities,
  values,
  change,
  advanced,
  setAdvanced,
  error,
  result,
  job,
  gallery,
  pending,
  generate,
  cancel,
  refresh,
  reset,
  restore,
  estimate,
  onCatalog,
}: {
  workspace: Workspace
  task: string
  model?: string
  capabilities: RecordValue
  values: RecordValue
  change: (name: string, value: unknown) => void
  advanced: string
  setAdvanced: (value: string) => void
  error: string
  result: unknown
  job: RecordValue | null
  gallery: RecordValue[]
  pending: boolean
  generate: () => Promise<void>
  cancel: () => Promise<void>
  refresh: () => Promise<void>
  reset: () => void
  restore: (recipe: RecordValue) => void
  estimate: () => Promise<void>
  onCatalog: () => void
}) {
  const [models, setModels] = useState(false)
  const [confirmStop, setConfirmStop] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState('')
  const busy = pending || submitting || stopping
  const canGenerate =
    !busy &&
    Boolean(model) &&
    Array.isArray(capabilities.workflows) &&
    Boolean(text(values.prompt, '').trim())
  const run = async () => {
    if (!canGenerate) return
    setSubmitting(true)
    setFailure('')
    try {
      await generate()
    } catch (e) {
      setFailure(describeError(e))
    } finally {
      setSubmitting(false)
    }
  }
  const workflows = list(capabilities.workflows)
  return (
    <div className="media-studio" data-screen={`playground-${task}`}>
      <aside className="media-controls" aria-label={`${task === 'video' ? 'Video' : 'Image'} controls`}>
        <h1>{task === 'video' ? 'Videos' : 'Images'}</h1>
        <Field label="Mode">
          <select
            disabled={busy}
            value={text(values.workflow, 'create')}
            onChange={(e) => change('workflow', e.target.value)}
          >
            {(workflows.length ? workflows : ['create']).map((workflow) => (
              <option key={workflow} value={workflow}>
                {(
                  {
                    'create': 'Create',
                    'edit': 'Edit',
                    'image-to-video': 'Image to video',
                    'transform': 'Transform',
                    'inpaint': 'Inpaint',
                    'extend': 'Extend',
                    'upscale': 'Upscale',
                  } as Record<string, string>
                )[workflow] ?? workflow}
              </option>
            ))}
          </select>
        </Field>
        <div className="media-prompt-card">
          <button className="media-model-trigger" disabled={busy} onClick={() => setModels(true)}>
            <span>{model || 'Choose a model'}</span>
            <ChevronDown size={16} />
          </button>
          <Field label="Prompt">
            <textarea
              disabled={busy}
              rows={3}
              value={text(values.prompt, '')}
              onChange={(e) => change('prompt', e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  void run()
                }
              }}
            />
          </Field>
          <div className="media-generate-slot">
            {pending ? (
              <button className="ew-button primary" disabled={stopping} onClick={() => setConfirmStop(true)}>
                <Square size={14} />
                {stopping ? 'Stopping…' : 'Stop'}
              </button>
            ) : (
              <button
                className="ew-button primary"
                disabled={!canGenerate}
                aria-busy={submitting || undefined}
                onClick={() => void run()}
              >
                <WandSparkles size={15} />
                {submitting ? 'Starting…' : 'Generate'}
              </button>
            )}
          </div>
        </div>
        {(error || failure) && (
          <p role="alert" className="ew-error">
            {error || failure}
          </p>
        )}
        {!model && (
          <p className="ew-muted">
            Choose a downloaded model to generate {task === 'video' ? 'videos' : 'images'}.
          </p>
        )}
        <div className="media-settings-heading">
          <strong>Settings</strong>
          <Action disabled={busy} title="Reset generation settings" onClick={reset}>
            <RotateCcw size={14} />
            Reset
          </Action>
        </div>
        <MediaParameters
          task={task}
          capabilities={capabilities}
          values={values}
          change={change}
          disabled={busy}
        />
        <details className="media-advanced">
          <summary>Advanced</summary>
          <Field label="Additional parameters">
            <textarea
              disabled={busy}
              className="code-input"
              value={advanced}
              onChange={(e) => setAdvanced(e.target.value)}
            />
          </Field>
          <details>
            <summary>Model capabilities</summary>
            <JsonResult value={capabilities} />
          </details>
          {task === 'video' && (
            <Action disabled={!model || busy} onClick={estimate}>
              Estimate
            </Action>
          )}
          <JsonResult value={result} />
        </details>
      </aside>
      <MediaGallery
        task={task}
        gallery={gallery}
        job={job}
        pending={pending}
        refresh={refresh}
        restore={restore}
        openModels={() => setModels(true)}
        hasModel={Boolean(model)}
      />
      {models && (
        <MediaModelPicker
          workspace={workspace}
          task={task}
          current={model}
          onClose={() => setModels(false)}
          onCatalog={onCatalog}
        />
      )}
      {confirmStop && (
        <DeleteConfirmation
          title="Stop generation?"
          name={task === 'video' ? 'Current video' : 'Current image'}
          detail="The unfinished result will be discarded."
          confirm="Stop generation"
          cancel="Keep generating"
          busy={stopping}
          onClose={() => setConfirmStop(false)}
          onConfirm={async () => {
            setStopping(true)
            try {
              await cancel()
            } finally {
              setStopping(false)
            }
          }}
        />
      )}
    </div>
  )
}
