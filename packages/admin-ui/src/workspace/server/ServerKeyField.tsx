// Lifted from Atomic-Chat/web-app/src/containers/server-concept/Settings.tsx @ 5043013; adapted: masked named API keys, with explicit reveal for clipboard only.
import { useState } from 'react'
import type { Workspace } from '../useWorkspace'
import { Action, Copy, Field } from '../Controls'
import { record, text } from '../types'
export function ServerKeyField({ workspace: w, openKeys }: { workspace: Workspace; openKeys?: () => void }) {
  const [key, setKey] = useState('')
  const keys = w.snapshot?.keys ?? []
  const id = keys.some((item) => item.id === key) ? key : keys[0]?.id
  return (
    <Field label="API key">
      <div className="server-key-field">
        <select aria-label="API key" value={id ?? ''} onChange={(e) => setKey(e.target.value)}>
          {!keys.length && <option value="">No API key</option>}
          {keys.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.preview}
            </option>
          ))}
        </select>
        {id && (
          <Copy
            label="Copy API key"
            secret
            value={async () => {
              const result = await w.execute('keys.reveal', { id })
              return typeof result === 'string'
                ? result
                : text(record(result).token ?? record(result).key, '')
            }}
          />
        )}
        <Action
          onClick={async () => {
            await w.execute('keys.create', { name: 'Server clients' })
            await w.refresh()
          }}
        >
          Generate key
        </Action>
        {openKeys && <Action onClick={openKeys}>Manage keys</Action>}
      </div>
    </Field>
  )
}
