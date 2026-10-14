import { useEffect, useRef, useState } from 'react'
import type { WorkspaceField, WorkspaceOperation } from '@contract'
import { Action, Copy, Field, JsonResult } from './Controls'
import type { Execute, RecordValue } from './types'
import { record } from './types'

function initialValues(operation: WorkspaceOperation) {
  return Object.fromEntries(
    Object.entries(operation.inputSchema.properties)
      .filter(([, field]) => field.default !== undefined)
      .map(([name, field]) => [
        name,
        field.type === 'object' || field.type === 'array'
          ? JSON.stringify(field.default, null, 2)
          : field.default,
      ])
  )
}
function parseValues(operation: WorkspaceOperation, values: RecordValue): RecordValue {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== '' && value !== undefined)
      .map(([name, value]) => {
        const field = operation.inputSchema.properties[name]
        if ((field?.type === 'object' || field?.type === 'array') && typeof value === 'string') {
          try {
            return [name, JSON.parse(value)]
          } catch {
            throw new Error(`${name.replaceAll('_', ' ')} must contain valid JSON.`)
          }
        }
        return [name, value]
      })
  )
}
export function OperationForm({
  operation,
  commandPrefix,
  execute,
  initial = {},
  onComplete,
}: {
  operation: WorkspaceOperation
  commandPrefix?: string
  execute: Execute
  initial?: RecordValue
  onComplete?: (value: unknown) => void
}) {
  const [values, setValues] = useState<RecordValue>(() => ({ ...initialValues(operation), ...initial }))
  const [result, setResult] = useState<unknown>()
  const [revealed, setRevealed] = useState(false)
  const initialRef = useRef(initial)
  initialRef.current = initial
  useEffect(() => {
    setValues({ ...initialValues(operation), ...initialRef.current })
    setResult(undefined)
    setRevealed(false)
  }, [operation])
  const required = operation.inputSchema.required
  return (
    <div className="operation-form">
      {operation.description !== operation.title && (
        <p className="ew-muted">{operation.description.replace(' Engine capability limits apply.', '')}</p>
      )}
      <div className="form-grid">
        {Object.entries(operation.inputSchema.properties).map(([name, field]) => (
          <Field
            key={name}
            label={`${name.replaceAll('_', ' ')}${required.includes(name) ? ' *' : ''}`}
            hint={field.description}
          >
            <SchemaInput
              name={name}
              field={field}
              value={values[name]}
              onChange={(value) => setValues((current) => ({ ...current, [name]: value }))}
            />
          </Field>
        ))}
      </div>
      <div className="ew-actions">
        <Action
          primary
          onClick={async () => {
            const input = parseValues(operation, values)
            const missing = required.filter((name) => input[name] === undefined)
            if (missing.length) throw new Error(`Required: ${missing.join(', ')}`)
            if (
              operation.effect === 'interrupt' &&
              !window.confirm(`${operation.title}? Running requests may be interrupted.`)
            )
              return
            const value = await execute(operation.name, input)
            setResult(value)
            onComplete?.(value)
          }}
        >
          {operation.title}
        </Action>
        <code>{operation.name}</code>
        {commandPrefix && (
          <Copy
            label="Copy this operation as a command"
            value={async () => {
              const input = parseValues(operation, values)
              const missing = required.filter((name) => input[name] === undefined)
              if (missing.length) throw new Error(`Required: ${missing.join(', ')}`)
              const json = JSON.stringify(input).replaceAll("'", "'\\''")
              return `${commandPrefix} control call ${operation.name} --input '${json}' --json`
            }}
          />
        )}
      </div>
      {result !== undefined && operation.effect === 'secret' && !revealed ? (
        <div className="ew-actions">
          <Action onClick={() => setRevealed(true)}>Show result</Action>
          <Copy value={JSON.stringify(result, null, 2)} label="Copy result" secret />
        </div>
      ) : (
        <JsonResult value={result} />
      )}
    </div>
  )
}
function SchemaInput({
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
  if (field.type === 'object' && field.properties)
    return <ObjectInput name={name} field={field} value={value} onChange={onChange} />
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
          : /key|token|password/.test(name)
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
          <Field
            key={key}
            label={`${key.replaceAll('_', ' ')}${field.required?.includes(key) ? ' *' : ''}`}
            hint={descriptor.description}
          >
            <SchemaInput
              name={`${name}.${key}`}
              field={descriptor}
              value={values[key]}
              onChange={(next) => onChange({ ...values, [key]: next })}
            />
          </Field>
        ))}
      </div>
      {field.additionalProperties && (
        <details>
          <summary>Additional fields (JSON)</summary>
          <textarea
            aria-label={`${name} additional fields`}
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
          {error && <small role="alert">{error}</small>}
        </details>
      )}
    </div>
  )
}
