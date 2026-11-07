import { workspaceApi } from '../workspace-api'
import type { connectorToolBindings } from '@view'
import { useState } from 'react'
import { Action, Field, JsonResult } from '../Controls'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
export function ChatTools({
  message,
  submit,
  disabled,
  connectors = [],
}: {
  message: RecordValue
  submit: (results: RecordValue[]) => Promise<unknown>
  disabled: boolean
  connectors?: ReturnType<typeof connectorToolBindings>
}) {
  const [results, setResults] = useState<Record<string, string>>({})
  const tools = rows(message.tool_calls)
  if (!tools.length) return null
  return (
    <section className="tool-review settings-form" aria-label="Tool results">
      <header>
        <h3>Tool results needed</h3>
        <p>Review the requested calls. Supply a result or deny each call, then continue.</p>
      </header>
      {tools.map((tool) => (
        <section
          className="tool-review-call"
          key={text(tool.id)}
          aria-label={text(record(tool.function).name)}
        >
          <strong>{text(record(tool.function).name)}</strong>
          <details className="tool-call-arguments" open>
            <summary>Arguments</summary>
            <JsonResult value={record(tool.function).arguments} />
          </details>
          <Field label={`Result for ${text(record(tool.function).name)}`}>
            <textarea
              disabled={disabled}
              value={results[text(tool.id)] ?? ''}
              onChange={(e) => setResults({ ...results, [text(tool.id)]: e.target.value })}
            />
          </Field>
          <div className="ew-actions">
            {connectors.some((c) => c.name === record(tool.function).name) && (
              <Action
                disabled={disabled || Boolean(results[text(tool.id)])}
                onClick={async () => {
                  const binding = connectors.find((c) => c.name === record(tool.function).name)!
                  const args: unknown = JSON.parse(text(record(tool.function).arguments, '{}'))
                  if (!args || typeof args !== 'object' || Array.isArray(args))
                    throw new Error('Tool arguments must be a JSON object.')
                  const result = await workspaceApi.execute('connectors.call', {
                    id: binding.id,
                    tool: binding.tool,
                    arguments: args,
                  })
                  setResults((current) => ({ ...current, [text(tool.id)]: JSON.stringify(result) }))
                }}
              >
                Approve & run {connectors.find((c) => c.name === record(tool.function).name)?.tool}
              </Action>
            )}
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
        </section>
      ))}
      <footer className="ew-actions">
        <Action
          primary
          disabled={disabled || tools.some((t) => !results[text(t.id)]?.trim())}
          onClick={() =>
            submit(tools.map((t) => ({ role: 'tool', tool_call_id: t.id, content: results[text(t.id)] })))
          }
        >
          Continue with tool results
        </Action>
      </footer>
    </section>
  )
}
