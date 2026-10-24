// Lifted from atomic-chat-ui/web-app/src/containers/images/ImagePromptForm.tsx @ 807b4d9; adapted: supported core capabilities and controlled request fields.
import { useState } from 'react'
import { Field } from '../Controls'
import { record, text } from '../types'
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
  const number = (name: string, label: string, fallback: { min: number; max: number; step?: number }) => {
    const limits = record(capabilities[name])
    const range = record(capabilities.ranges)[name]
    const bounds = Array.isArray(range) ? range : []
    const min = Number(limits.min ?? bounds[0] ?? fallback.min),
      max = Number(limits.max ?? bounds[1] ?? fallback.max)
    const step = Number(limits.step ?? fallback.step ?? 1)
    return (
      <label className="media-parameter" key={name}>
        <span>{label}</span>
        <input
          type="range"
          aria-label={`${label} slider`}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={Number(values[name] ?? min)}
          onChange={(e) => change(name, Number(e.target.value))}
        />
        <input
          type="number"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={text(values[name], '')}
          onChange={(e) => change(name, e.target.value === '' ? undefined : Number(e.target.value))}
        />
      </label>
    )
  }
  return (
    <>
      {Boolean(capabilities.supportsNegativePrompt) && (
        <details className="media-negative">
          <summary>Negative prompt</summary>
          <textarea
            aria-label="Negative prompt"
            disabled={disabled}
            value={text(values.negativePrompt, '')}
            onChange={(e) => change('negativePrompt', e.target.value)}
          />
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
          {task === 'image' && number('strength', 'Strength', { min: 0, max: 1, step: 0.05 })}
        </div>
      )}
      <div className="media-size-fields">
        {['width', 'height'].map((name) => (
          <Field key={name} label={name === 'width' ? 'Width' : 'Height'}>
            <input
              type="number"
              min={Number(record(capabilities[name]).min ?? capabilities.minDim ?? 64)}
              max={Number(record(capabilities[name]).max ?? capabilities.maxDim ?? 8192)}
              step={Number(record(capabilities[name]).step ?? capabilities.dimMultiple ?? 16)}
              disabled={disabled}
              value={text(values[name], '')}
              onChange={(e) => change(name, e.target.value === '' ? undefined : Number(e.target.value))}
            />
          </Field>
        ))}
      </div>
      {task === 'video' && (
        <div className="media-video-duration">
          {number('frames', 'Frames', { min: 1, max: 161, step: 1 })}
          <span>
            {Number(values.fps ?? capabilities.fps ?? 24)} fps ·{' '}
            {(Number(values.frames ?? 0) / Number(values.fps ?? capabilities.fps ?? 24)).toFixed(1)}s
          </span>
        </div>
      )}
      {number('steps', 'Steps', { min: 1, max: 50 })}
      {number('cfgScale', 'CFG scale', { min: 1, max: 20, step: 0.5 })}
      {Boolean(capabilities.supportsGuidance) &&
        number('guidance', 'Guidance', { min: 0, max: 20, step: 0.5 })}
      {task === 'image' && number('batchSize', 'Images', { min: 1, max: Number(capabilities.maxBatch ?? 1) })}
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
    <Field label={label} hint={error}>
      <input
        type="file"
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
    </Field>
  )
}
