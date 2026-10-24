// Lifted from atomic-chat-ui AddEditAssistant and AgentSkillCreateDialog @ 807b4d9; adapted: shared server operations.
import { useState } from 'react'
import { Action, Field } from '../Controls'
import { useDialog } from '../useDialog'
import type { Workspace } from '../useWorkspace'
type Value = Record<string, unknown>
export function FeatureEditor({
  kind,
  initial,
  workspace,
  close,
}: {
  kind: 'assistants' | 'skills' | 'connectors'
  initial: Value
  workspace: Workspace
  close: () => void
}) {
  const [value, setValue] = useState(initial),
    [pending, setPending] = useState(false),
    [error, setError] = useState('')
  const ref = useDialog(() => {
    if (!pending) close()
  })
  const field = (key: string, label: string, multiline = false) => (
    <Field label={label}>
      {multiline ? (
        <textarea
          rows={key === 'instructions' || key === 'body' ? 7 : 3}
          value={String(value[key] ?? '')}
          onChange={(e) => setValue({ ...value, [key]: e.target.value })}
        />
      ) : (
        <input
          disabled={kind === 'skills' && key === 'name' && Boolean(initial.name)}
          value={String(value[key] ?? '')}
          onChange={(e) => setValue({ ...value, [key]: e.target.value })}
        />
      )}
    </Field>
  )
  return (
    <div className="modal-shade">
      <section
        ref={ref}
        className="ew-modal feature-editor"
        role="dialog"
        aria-modal="true"
        aria-label={`${initial.id || initial.name ? 'Edit' : 'Add'} ${kind === 'assistants' ? 'assistant' : kind === 'skills' ? 'skill' : 'connector'}`}
        tabIndex={-1}
      >
        <h2>
          {initial.id || initial.name ? 'Edit' : 'Add'}{' '}
          {kind === 'assistants' ? 'assistant' : kind === 'skills' ? 'skill' : 'connector'}
        </h2>
        {field('name', 'Name')}
        {kind !== 'connectors' && field('description', 'Description')}
        {kind === 'assistants' && (
          <>
            {field('avatar', 'Avatar')}
            {field('instructions', 'Instructions', true)}
            <details>
              <summary>Sampling parameters</summary>
              {['temperature', 'top_p', 'top_k', 'repeat_penalty', 'max_tokens'].map((key) => (
                <Field key={key} label={key.replaceAll('_', ' ')}>
                  <input
                    type="number"
                    step="any"
                    value={String((value.parameters as Value)?.[key] ?? '')}
                    onChange={(e) => {
                      const parameters = { ...(value.parameters as Value) }
                      if (e.target.value === '') delete parameters[key]
                      else parameters[key] = Number(e.target.value)
                      setValue({ ...value, parameters })
                    }}
                  />
                </Field>
              ))}
            </details>
          </>
        )}
        {kind === 'skills' && (
          <>
            {field('body', 'Instructions', true)}
            <label className="feature-switch">
              <input
                type="checkbox"
                checked={value.enabled !== false}
                onChange={(e) => setValue({ ...value, enabled: e.target.checked })}
              />
              Enabled
            </label>
          </>
        )}
        {kind === 'connectors' && (
          <>
            <Field label="Transport">
              <select
                value={String(value.type ?? 'http')}
                onChange={(e) => setValue({ ...value, type: e.target.value })}
              >
                <option value="http">HTTP</option>
                <option value="sse">SSE</option>
                <option value="stdio">Stdio</option>
              </select>
            </Field>
            {value.type === 'stdio' ? (
              <>
                {field('command', 'Command')}
                {field('args_text', 'Arguments (JSON)', true)}
                {field('env_text', 'Environment (JSON)', true)}
              </>
            ) : (
              <>
                {field('url', 'MCP URL')}
                {field('headers_text', 'Headers (JSON)', true)}
              </>
            )}
            <Field label="Tool call timeout (seconds)">
              <input
                type="number"
                min={1}
                max={300}
                value={Number(value.timeout ?? 30)}
                onChange={(e) => setValue({ ...value, timeout: Number(e.target.value) })}
              />
            </Field>
            <label className="feature-switch">
              <input
                type="checkbox"
                checked={value.enabled !== false}
                onChange={(e) => setValue({ ...value, enabled: e.target.checked })}
              />
              Enabled
            </label>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="ew-actions">
          <Action disabled={pending} onClick={close}>
            Cancel
          </Action>
          <Action
            primary
            disabled={pending}
            onClick={async () => {
              setPending(true)
              setError('')
              try {
                const next: Value = {
                  ...value,
                  ...(kind === 'skills' && initial.name ? { id: initial.name } : {}),
                }
                if (kind === 'connectors') {
                  next.args = JSON.parse(String(value.args_text || '[]'))
                  next.env = JSON.parse(String(value.env_text || '{}'))
                  next.headers = JSON.parse(String(value.headers_text || '{}'))
                  delete next.args_text
                  delete next.env_text
                  delete next.headers_text
                }
                await workspace.execute(`${kind}.save`, { value: next })
                close()
              } catch (error) {
                setError(error instanceof Error ? error.message : String(error))
              } finally {
                setPending(false)
              }
            }}
          >
            {pending ? 'Saving…' : 'Save'}
          </Action>
        </div>
      </section>
    </div>
  )
}
