import { useConfirmation } from './use-confirmation'
import { useEffect, useRef, useState } from 'react'
import type { WorkspaceOperation } from '@contract'
import { Action, Copy, JsonResult } from './Controls'
import type { Execute, RecordValue } from './types'
import { OperationField } from './OperationFields'

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
  const { ask, confirmation, waiting } = useConfirmation()
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
  const run = async (input: RecordValue) => {
    const value = await execute(operation.name, input)
    setResult(value)
    onComplete?.(value)
  }
  return (
    <div className="operation-form settings-form">
      {confirmation}
      {operation.description !== operation.title && (
        <p className="ew-muted">{operation.description.replace(' Engine capability limits apply.', '')}</p>
      )}
      <div className="form-grid">
        {Object.entries(operation.inputSchema.properties).map(([name, field]) => (
          <OperationField
            key={name}
            name={name}
            field={field}
            required={required.includes(name)}
            value={values[name]}
            onChange={(value) => setValues((current) => ({ ...current, [name]: value }))}
          />
        ))}
      </div>
      <div className="ew-actions">
        <Action
          primary
          disabled={waiting}
          onClick={async () => {
            const input = parseValues(operation, values)
            const missing = required.filter((name) => input[name] === undefined)
            if (missing.length) throw new Error(`Required: ${missing.join(', ')}`)
            if (operation.effect === 'interrupt' || operation.effect === 'execute') {
              ask({
                title: `${operation.title}?`,
                actionLabel: operation.title,
                children: (
                  <p>
                    {operation.effect === 'execute'
                      ? 'A stdio connector runs a program on the server’s host as the server’s user.'
                      : 'Running requests may be interrupted.'}
                  </p>
                ),
                onConfirm: () => run(input),
              })
              return
            }
            await run(input)
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
