import { useState } from 'react'
import { Action, Copy, Field, JsonResult } from '../Controls'
import { Message } from './Message'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
import type { ChatPreferences } from './chat-preferences'
export function ChatMessages({
  messages,
  preferences,
  busy,
  edit,
  fork,
  regenerate,
}: {
  messages: RecordValue[]
  preferences: ChatPreferences
  busy: boolean
  edit: (index: number, content: string) => Promise<unknown>
  fork: (index: number) => Promise<unknown>
  regenerate: (index: number) => Promise<unknown>
}) {
  const [editing, setEditing] = useState(-1),
    [draft, setDraft] = useState('')
  return (
    <>
      {messages.map((message, index) => {
        if (message.role === 'system' && !preferences.showSystem) return null
        const meta = record(message.atomic_meta),
          usage = record(meta.usage)
        const content =
          typeof message.content === 'string'
            ? message.content
            : rows(message.content)
                .map((x) => x.text ?? '[Image]')
                .join('\n')
        return (
          <article className={`chat-message message-${message.role}`} key={index}>
            <span className="message-role">
              {text(message.role)} {meta.provider ? `· ${text(meta.provider)} · ${text(meta.model)}` : ''}
            </span>
            {editing === index ? (
              <>
                <Field label="Edit message in a new branch">
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
                </Field>
                <Action
                  disabled={busy}
                  onClick={async () => {
                    await edit(index, draft)
                    setEditing(-1)
                  }}
                >
                  Save branch
                </Action>
                <button className="ew-button" onClick={() => setEditing(-1)}>
                  Cancel edit
                </button>
              </>
            ) : (
              <Message message={message} markdown={preferences.markdown} />
            )}
            {preferences.showStats && meta.duration_ms !== undefined && (
              <div className="message-stats">
                {(Number(meta.duration_ms) / 1000).toFixed(1)}s ·{' '}
                {usage.completion_tokens === undefined
                  ? 'Token count unavailable'
                  : `${usage.completion_tokens} output tokens`}
                {meta.first_token_ms !== undefined &&
                  ` · First token ${(Number(meta.first_token_ms) / 1000).toFixed(2)}s`}
                {meta.state === 'stopped' && ' · Stopped — partial answer'}
                <details>
                  <summary>Response details</summary>
                  <JsonResult value={meta} />
                </details>
              </div>
            )}
            <div className="ew-actions message-actions">
              <Copy value={content || JSON.stringify(message.tool_calls ?? message)} label="Copy message" />
              <Action
                disabled={busy || typeof message.content !== 'string'}
                onClick={() => {
                  setDraft(content)
                  setEditing(index)
                }}
              >
                Edit in branch
              </Action>
              <Action disabled={busy} onClick={() => fork(index)}>
                Fork here
              </Action>
              {message.role === 'assistant' && (
                <Action disabled={busy} onClick={() => regenerate(index)}>
                  Regenerate in branch
                </Action>
              )}
            </div>
          </article>
        )
      })}
    </>
  )
}
