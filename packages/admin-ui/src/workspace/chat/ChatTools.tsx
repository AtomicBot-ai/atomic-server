import { useState } from 'react'
import { Action, Field, JsonResult } from '../Controls'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
export function ChatTools({
  message,
  submit,
  disabled,
}: {
  message: RecordValue
  submit: (results: RecordValue[]) => Promise<unknown>
  disabled: boolean
}) {
  const [results, setResults] = useState<Record<string, string>>({})
  const tools = rows(message.tool_calls)
  if (!tools.length) return null
  return (
    <section className="tool-review">
      <h3>Tool results needed</h3>
      <p>Review the requested calls. Supply a result or deny each call, then continue.</p>
      {tools.map((tool) => (
        <div key={text(tool.id)}>
          <strong>{text(record(tool.function).name)}</strong>
          <JsonResult value={record(tool.function).arguments} />
          <Field label={`Result for ${text(record(tool.function).name)}`}>
            <textarea
              disabled={disabled}
              value={results[text(tool.id)] ?? ''}
              onChange={(e) => setResults({ ...results, [text(tool.id)]: e.target.value })}
            />
          </Field>
          {record(tool.function).name === 'get_datetime' && (
            <Action
              disabled={disabled}
              onClick={() =>
                setResults({
                  ...results,
                  [text(tool.id)]: JSON.stringify({ datetime: new Date().toISOString() }),
                })
              }
            >
              Approve browser time
            </Action>
          )}
          <Action
            disabled={disabled}
            onClick={() =>
              setResults({
                ...results,
                [text(tool.id)]: JSON.stringify({ error: 'User denied this tool call.' }),
              })
            }
          >
            Deny call
          </Action>
        </div>
      ))}
      <Action
        primary
        disabled={disabled || tools.some((t) => !results[text(t.id)]?.trim())}
        onClick={() =>
          submit(tools.map((t) => ({ role: 'tool', tool_call_id: t.id, content: results[text(t.id)] })))
        }
      >
        Continue with tool results
      </Action>
    </section>
  )
}
