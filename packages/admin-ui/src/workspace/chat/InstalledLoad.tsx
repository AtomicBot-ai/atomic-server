import { useEffect, useState } from 'react'
import { describeError } from '@/services/admin-api'
import { workspaceApi } from '../workspace-api'
import { rows, text, type RecordValue } from '../types'
import { Action } from '../Controls'

/** An installed model loaded from the chat with the provider chosen among those that list it. */
export function InstalledLoad({ disabled }: { disabled: boolean }) {
  const [installed, setInstalled] = useState<RecordValue[]>([])
  const [choice, setChoice] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void workspaceApi
      .execute('models.installed')
      .then((v) => active && setInstalled(rows(v)))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])
  const options = installed.flatMap((m) =>
    (Array.isArray(m.providers) ? m.providers.map(String) : [text(m.provider)]).map((p) => ({
      value: `${p}|${text(m.id)}`,
      label: `${p} · ${text(m.name ?? m.id)}`,
    }))
  )
  if (!options.length) return null
  return (
    <div className="installed-load">
      <select
        aria-label="Installed model and engine"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
      >
        <option value="">Load an installed model…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Action
        disabled={disabled || !choice}
        onClick={async () => {
          const [provider, ...rest] = choice.split('|')
          setError('')
          await workspaceApi
            .execute('models.load', { provider, model_id: rest.join('|') })
            .catch((e: unknown) => setError(describeError(e)))
        }}
      >
        Load with this engine
      </Action>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
