import { FileInput } from '../FileInput'
// Lifted from atomic-chat-ui/web-app/src/containers/images/ImagePromptForm.tsx @ 807b4d9; adapted: supported core capabilities and controlled request fields.
import { useId, useState } from 'react'
import { Field } from '../Controls'
import { SettingsField } from '../SettingsField'
import { text } from '../types'
import { mediaBounds, mediaFieldError } from './media-validation'
import type { RecordValue } from '../types'

export function MediaParameters({
  task,
  capabilities,
  values,
  change,
  disabled,
}: {
  task: string
  capabilities: RecordValue
  values: RecordValue
  change: (name: string, value: unknown) => void
  disabled: boolean
}) {
  const id = useId()
  const number = (name: string, label: string) => {
    const { min, max, step } = mediaBounds(capabilities, name)
    const error = mediaFieldError(capabilities, name, values[name])
    return (
      <div className="media-range-field" key={name}>
        <SettingsField
          label={label}
          layout="stacked"
          error={error}
          actions={
            <input
              type="range"
              aria-label={`${label} slider`}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-${name}-error` : undefined}
              min={min}
              max={max}
              step={step}
              disabled={disabled}
              value={Number(values[name] ?? min)}
              onChange={(e) => change(name, Number(e.target.value))}
            />
          }
        >
          <input
            id={`${id}-${name}`}
            type="number"
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            value={text(values[name], '')}
            onChange={(e) => change(name, e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </SettingsField>
      </div>
    )
  }
  return (
    <>
      {Boolean(capabilities.supportsNegativePrompt) && (
        <details className="media-negative">
          <summary>Negative prompt</summary>
          <Field label="Negative prompt">
            <textarea
              disabled={disabled}
              value={text(values.negativePrompt, '')}
              onChange={(e) => change('negativePrompt', e.target.value)}
            />
          </Field>
        </details>
      )}
      {values.workflow !== 'create' && (
        <div className="media-source-fields">
          <ImageInput
            label="Source image"
            disabled={disabled}
            onChange={(value) => change('initImage', value)}
          />
          {['inpaint', 'extend'].includes(text(values.workflow)) && (
            <ImageInput
              label="Mask image"
              disabled={disabled}
              onChange={(value) => change('maskImage', value)}
            />
          )}
          {task === 'image' && number('strength', 'Strength')}
        </div>
      )}
      <div className="media-size-fields">
        {['width', 'height'].map((name) => {
          const error = mediaFieldError(capabilities, name, values[name])
          return (
            <SettingsField
              key={name}
              label={name === 'width' ? 'Width' : 'Height'}
              layout="stacked"
              error={error}
            >
              <input
                type="number"
                aria-label={name === 'width' ? 'Width' : 'Height'}
                {...mediaBounds(capabilities, name)}
                disabled={disabled}
                value={text(values[name], '')}
                onChange={(e) => change(name, e.target.value === '' ? undefined : Number(e.target.value))}
              />
            </SettingsField>
          )
        })}
      </div>
      {task === 'video' && (
        <div className="media-video-duration">
          {number('frames', 'Frames')}
          <span>
            {Number(values.fps ?? capabilities.fps ?? 24)} fps ·{' '}
            {(Number(values.frames ?? 0) / Number(values.fps ?? capabilities.fps ?? 24)).toFixed(1)}s
          </span>
        </div>
      )}
      {number('steps', 'Steps')}
      {number('cfgScale', 'CFG scale')}
      {Boolean(capabilities.supportsGuidance) && number('guidance', 'Guidance')}
      {task === 'image' && number('batchSize', 'Images')}
      <Field label="Seed">
        <input
          type="number"
          min={-1}
          step={1}
          disabled={disabled}
          value={text(values.seed, '')}
          placeholder="Random"
          onChange={(e) => change('seed', e.target.value === '' ? undefined : Number(e.target.value))}
        />
      </Field>
    </>
  )
}
function ImageInput({
  label,
  disabled,
  onChange,
}: {
  label: string
  disabled: boolean
  onChange: (value: { base64: string }) => void
}) {
  const [error, setError] = useState('')
  return (
    <FileInput
      label={label}
      hint={error}
      accept="image/png,image/jpeg,image/webp"
      disabled={disabled}
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (file.size > 10 * 1024 * 1024) {
          setError('Choose an image below 10 MB.')
          return
        }
        setError('')
        const reader = new FileReader()
        reader.onload = () => onChange({ base64: String(reader.result) })
        reader.onerror = () => setError('The image could not be read. Choose it again.')
        reader.readAsDataURL(file)
      }}
    />
  )
}
