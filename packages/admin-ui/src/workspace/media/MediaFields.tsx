import { useState } from 'react'
import { Field } from '../Controls'
import { list, record, text } from '../types'
import type { RecordValue } from '../types'
export function MediaFields({
  task,
  capabilities,
  values,
  change,
}: {
  task: string
  capabilities: RecordValue
  values: RecordValue
  change: (name: string, value: unknown) => void
}) {
  const visual = task === 'image' || task === 'video'
  return (
    <>
      {visual ? (
        <>
          <div className="form-grid">
            <Field label="Workflow">
              <select
                value={text(values.workflow, 'create')}
                onChange={(e) => change('workflow', e.target.value)}
              >
                {(list(capabilities.workflows).length ? list(capabilities.workflows) : ['create'])
                  .filter((value) => value !== 'image-to-video')
                  .map((value) => (
                    <option key={value}>{value}</option>
                  ))}
              </select>
            </Field>
            {[
              'width',
              'height',
              'steps',
              'cfgScale',
              ...(task === 'image' ? ['batchSize'] : ['frames']),
              'seed',
            ].map((name) => (
              <Field key={name} label={{ cfgScale: 'CFG scale', batchSize: 'Batch size' }[name] || name}>
                <input
                  type="number"
                  value={text(values[name], '')}
                  min={name === 'seed' ? -1 : 1}
                  max={name === 'batchSize' ? Number(capabilities.maxBatch || 1) : undefined}
                  step={
                    name === 'width' || name === 'height'
                      ? Number(capabilities.dimMultiple || 16)
                      : name === 'frames'
                        ? Number(record(capabilities.frames).step || 1)
                        : name === 'cfgScale'
                          ? 0.1
                          : 1
                  }
                  onChange={(e) => change(name, e.target.value === '' ? undefined : Number(e.target.value))}
                />
              </Field>
            ))}
            {Boolean(capabilities.supportsGuidance) && (
              <Field label="Guidance">
                <input
                  type="number"
                  step="0.1"
                  value={text(values.guidance, '')}
                  onChange={(e) => change('guidance', Number(e.target.value))}
                />
              </Field>
            )}
          </div>
          {Boolean(capabilities.supportsNegativePrompt) && (
            <Field label="Negative prompt">
              <textarea
                value={text(values.negativePrompt, '')}
                onChange={(e) => change('negativePrompt', e.target.value)}
              />
            </Field>
          )}
          {values.workflow !== 'create' && (
            <div className="form-grid">
              <ImageInput label="Source image" onChange={(value) => change('initImage', value)} />
              {['inpaint', 'extend'].includes(text(values.workflow)) && (
                <ImageInput label="Mask image" onChange={(value) => change('maskImage', value)} />
              )}
              <Field label="Strength">
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={Number(values.strength ?? 0.75)}
                  onChange={(e) => change('strength', Number(e.target.value))}
                />
              </Field>
            </div>
          )}
        </>
      ) : task === 'decision' ? (
        <>
          <Field label="Question">
            <textarea
              value={text(values.instructions, '')}
              onChange={(e) => change('instructions', e.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field label="Answer type">
              <select
                value={text(values.questionType, 'noul')}
                onChange={(e) => change('questionType', e.target.value)}
              >
                <option value="noul">Yes / No</option>
                <option value="choice">Choice</option>
                <option value="score">Score</option>
              </select>
            </Field>
            <Field label="Criteria (JSON)">
              <textarea
                value={text(values.criteria, '')}
                onChange={(e) => change('criteria', e.target.value)}
              />
            </Field>
          </div>
        </>
      ) : task === 'router' ? (
        <>
          <Field label="Criterion">
            <input value={text(values.criterion, '')} onChange={(e) => change('criterion', e.target.value)} />
          </Field>
          <Field label="Candidates (JSON)">
            <textarea
              className="code-input"
              value={text(values.candidates, '[]')}
              onChange={(e) => change('candidates', e.target.value)}
            />
          </Field>
        </>
      ) : null}
    </>
  )
}
function ImageInput({ label, onChange }: { label: string; onChange: (value: { base64: string }) => void }) {
  const [error, setError] = useState('')
  return (
    <Field label={label} hint={error}>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
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
          reader.readAsDataURL(file)
        }}
      />
    </Field>
  )
}
