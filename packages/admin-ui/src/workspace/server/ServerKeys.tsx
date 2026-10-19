import { useState } from 'react'
import type { Workspace } from '../useWorkspace'
import { Action, Copy, Panel } from '../Controls'
import { record, text } from '../types'
export function ServerKeys({ workspace: w }: { workspace: Workspace }) {
  const s = w.snapshot
  const [keyName, setKeyName] = useState('')
  return (
    <Panel title="API keys">
      <div className="key-create">
        <input
          aria-label="New API key name"
          placeholder="Key name"
          maxLength={48}
          value={keyName}
          onChange={(e) => setKeyName(e.target.value)}
        />
        <Action
          disabled={!keyName.trim()}
          onClick={async () => {
            await w.execute('keys.create', { name: keyName.trim() })
            setKeyName('')
          }}
        >
          Create key
        </Action>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Key</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {s?.keys.map((key) => (
              <tr key={key.id}>
                <td>{key.name}</td>
                <td>
                  <code>{key.preview}</code>
                </td>
                <td>{new Date(key.createdAt).toLocaleDateString()}</td>
                <td>
                  <div className="ew-actions">
                    <Copy
                      secret
                      label="Copy key"
                      value={async () => {
                        const result = record(await w.execute('keys.reveal', { id: key.id }))
                        return text(result.token ?? result.key, '')
                      }}
                    />
                    <Action
                      danger
                      disabled={s.keys.length < 2}
                      onClick={() => {
                        if (window.confirm(`Revoke ${key.name}? Clients using it will lose access.`))
                          return w.execute('keys.revoke', { id: key.id })
                      }}
                    >
                      Revoke
                    </Action>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
