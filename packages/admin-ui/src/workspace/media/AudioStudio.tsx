import { useId, useState } from 'react'
import { ChevronDown, Square, WandSparkles } from 'lucide-react'
import { audioPhaseText } from '@view'
import { audioJobRequest } from '@view'
import type { AudioControl } from '@view'
import { Field } from '../Controls'
import { DeleteConfirmation } from '../library/DeleteConfirmation'
import { ModelMark } from '../library/catalog/ModelMark'
import { describeError } from '@/services/admin-api'
import { record, text } from '../types'
import type { RecordValue } from '../types'
import type { Workspace } from '../useWorkspace'
import { AudioClips } from './AudioClips'
import { MediaModelPicker } from './MediaModelPicker'
import { useAudioStudio } from './useAudioStudio'
import './media-studio.css'
import './audio-studio.css'

const PROMPTS: Record<string, string> = {
  speech: 'Text to say',
  music: 'Describe the music',
  effects: 'Describe the sound',
}

function ControlField({
  control,
  value,
  voices,
  disabled,
  change,
}: {
  control: AudioControl
  value: unknown
  voices: string[]
  disabled: boolean
  change: (value: unknown) => void
}) {
  const id = useId()
  const effective = audioJobRequest({ [control.name]: value }, [control])[control.name]
  const adjustment =
    typeof value === 'number' && effective !== value
      ? `This model will use ${effective}. Your entered value is kept.`
      : ''
  if (control.kind === 'voice' && voices.length)
    return (
      <Field label={control.label}>
        <select disabled={disabled} value={text(value, '')} onChange={(e) => change(e.target.value)}>
          <option value="">Model default</option>
          {voices.map((voice) => (
            <option key={voice} value={voice}>
              {voice}
            </option>
          ))}
        </select>
      </Field>
    )
  if (control.kind === 'voice') return null
  if (control.kind === 'long-text')
    return (
      <Field label={control.label}>
        <textarea
          disabled={disabled}
          rows={4}
          value={text(value, '')}
          onChange={(e) => change(e.target.value)}
        />
      </Field>
    )
  const number = control.kind === 'number'
  return (
    <Field label={control.label}>
      <input
        disabled={disabled}
        type={number ? 'number' : 'text'}
        aria-label={control.label}
        min={control.min}
        max={control.max}
        aria-describedby={adjustment ? id : undefined}
        value={text(value, '')}
        onChange={(e) => change(number && e.target.value !== '' ? Number(e.target.value) : e.target.value)}
      />
      {adjustment && <small id={id}>{adjustment}</small>}
    </Field>
  )
}

/** Speech, music or effects from the loaded model: it makes one mode, so the form is that mode's. */
export function AudioStudio({ workspace, onCatalog }: { workspace: Workspace; onCatalog: () => void }) {
  const studio = useAudioStudio(workspace)
  const [models, setModels] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState('')
  const hintId = useId()
  const { model, name, mode, details, controls, values, pending } = studio
  const words = text(values.text, '')
  const busy = pending || submitting || studio.loading
  const run = async () => {
    setSubmitting(true)
    setFailure('')
    try {
      await studio.generate()
    } catch (e) {
      setFailure(describeError(e))
    } finally {
      setSubmitting(false)
    }
  }
  const job: RecordValue = studio.job
  const jobError = text(record(job.error).message, '')
  return (
    <div className="media-studio" data-screen="playground-audio">
      <aside className="media-controls" aria-label="Audio controls">
        <h1>Audio</h1>
        <div className="media-prompt-card">
          <button className="media-model-trigger" disabled={busy} onClick={() => setModels(true)}>
            {model && <ModelMark model={{ name, icon: details?.icon }} />}
            <span>{name || 'Choose audio model'}</span>
            <ChevronDown size={16} />
          </button>
          {details?.attribution && <small className="audio-attribution">{details.attribution}</small>}
          <Field label={PROMPTS[mode] ?? 'Text'}>
            <textarea
              disabled={busy}
              rows={3}
              value={words}
              onChange={(e) => studio.change('text', e.target.value)}
            />
          </Field>
          <div className="media-generate-slot">
            {pending ? (
              <button className="ew-button primary" onClick={() => setStopping(true)}>
                <Square size={14} />
                Stop
              </button>
            ) : (
              <button
                className="ew-button primary"
                disabled={busy || !model || !mode || !words.trim()}
                aria-describedby={hintId}
                aria-busy={submitting || undefined}
                onClick={() => void run()}
              >
                <WandSparkles size={15} />
                {submitting ? 'Starting…' : 'Generate'}
              </button>
            )}
          </div>
        </div>
        <p id={hintId} className="ew-muted media-generation-hint">
          {!model
            ? 'Choose a downloaded model to generate audio.'
            : busy
              ? 'Wait for the current operation to finish.'
              : !words.trim()
                ? 'Enter text to generate audio.'
                : ''}
        </p>
        {pending && (
          <p role="status" className="ew-muted">
            {audioPhaseText(record(job).progress as Parameters<typeof audioPhaseText>[0])}
          </p>
        )}
        {(studio.error || failure || jobError) && (
          <p role="alert" className="ew-error">
            {studio.error || failure || jobError}
          </p>
        )}
        {controls.map((control) => (
          <ControlField
            key={control.name}
            control={control}
            value={values[control.name]}
            voices={studio.voices}
            disabled={busy}
            change={(value) => studio.change(control.name, value)}
          />
        ))}
      </aside>
      <AudioClips
        clips={studio.clips}
        hasModel={Boolean(model)}
        openModels={() => setModels(true)}
        remove={studio.remove}
      />
      {models && (
        <MediaModelPicker
          workspace={workspace}
          task="audio"
          current={model}
          onClose={() => setModels(false)}
          onCatalog={onCatalog}
        />
      )}
      {stopping && (
        <DeleteConfirmation
          title="Stop generation?"
          name="Current clip"
          detail="The unfinished clip is discarded, and the audio engine restarts for the next one."
          confirm="Stop generation"
          cancel="Keep generating"
          onClose={() => setStopping(false)}
          onConfirm={studio.cancel}
        />
      )}
    </div>
  )
}
