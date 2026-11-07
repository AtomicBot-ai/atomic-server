import { useId, useState } from 'react'
import type { WorkspaceField } from '@contract'
import { Field } from './Controls'
import { SettingsField } from './SettingsField'
import { record } from './types'

type Props = { name: string; field: WorkspaceField; value: unknown; onChange: (value: unknown) => void }

/** Object parameters are groups; only native inputs receive a field label. */
export function OperationField({
  name,
  field,
  value,
  onChange,
  required = false,
  labelName = name,
}: Props & { required?: boolean; labelName?: string }) {
  const id = useId()
  const label = `${labelName.replaceAll('_', ' ')}${required ? ' *' : ''}`
  if (field.type === 'object' && field.properties && !field.enum)
    return (
      <fieldset className="settings-field-group" aria-describedby={field.description ? id : undefined}>
        <legend>{label}</legend>
        {field.description && <p id={id}>{field.description}</p>}
        <ObjectInput name={name} field={field} value={value} onChange={onChange} />
      </fieldset>
    )
  return (
    <Field label={label} hint={field.description}>
      {schemaInput({ name, field, value, onChange })}
    </Field>
  )
}

function schemaInput({
  name,
  field,
  value,
  onChange,
}: {
  name: string
  field: WorkspaceField
  value: unknown
  onChange: (value: unknown) => void
}) {
  if (field.enum)
    return (
      <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {field.enum.map((item) => (
          <option key={item}>{item}</option>
        ))}
      </select>
    )
  if (field.type === 'boolean')
    return (
      <select
        value={value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'true')}
      >
        <option value="">Default</option>
        <option value="true">On</option>
        <option value="false">Off</option>
      </select>
    )
  if (field.type === 'object' || field.type === 'array')
    return (
      <textarea
        spellCheck={false}
        className="code-input"
        value={String(value ?? '')}
        placeholder={field.type === 'object' ? '{}' : '[]'}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  return (
    <input
      type={
        field.type === 'number' || field.type === 'integer'
          ? 'number'
          : /(^|_)(api_?key|token|password|secret)$|^key$/.test(name)
            ? 'password'
            : 'text'
      }
      min={field.minimum}
      max={field.maximum}
      step={field.type === 'integer' ? 1 : 'any'}
      value={String(value ?? '')}
      onChange={(e) =>
        onChange(
          e.target.type === 'number'
            ? e.target.value === ''
              ? undefined
              : Number(e.target.value)
            : e.target.value
        )
      }
    />
  )
}

function ObjectInput({
  name,
  field,
  value,
  onChange,
}: {
  name: string
  field: WorkspaceField
  value: unknown
  onChange: (value: unknown) => void
}) {
  let values = record(value)
  if (typeof value === 'string') {
    try {
      values = record(JSON.parse(value))
    } catch {
      /* Keep typed fields empty until JSON is valid. */
    }
  }
  const [extra, setExtra] = useState('')
  const [error, setError] = useState('')
  return (
    <div className="nested-fields">
      <div className="form-grid">
        {Object.entries(field.properties ?? {}).map(([key, descriptor]) => (
          <OperationField
            key={key}
            name={`${name}.${key}`}
            labelName={key}
            field={descriptor}
            required={field.required?.includes(key)}
            value={values[key]}
            onChange={(next) => onChange({ ...values, [key]: next })}
          />
        ))}
      </div>
      {field.additionalProperties && (
        <details>
          <summary>Additional fields (JSON)</summary>
          <SettingsField label={`${name} additional fields`} layout="stacked" error={error}>
            <textarea
              className="code-input"
              placeholder="{}"
              value={extra}
              onChange={(event) => {
                const raw = event.target.value
                setExtra(raw)
                try {
                  onChange({ ...values, ...record(JSON.parse(raw || '{}')) })
                  setError('')
                } catch {
                  onChange(raw)
                  setError('Enter a JSON object.')
                }
              }}
            />
          </SettingsField>
        </details>
      )}
    </div>
  )
}
