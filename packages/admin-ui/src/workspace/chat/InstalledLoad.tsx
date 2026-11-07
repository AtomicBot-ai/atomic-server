import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { engineName } from '@view'
import type { WorkspaceServiceRow } from '@contract'
import { describeError } from '@/services/admin-api'
import { workspaceApi } from '../workspace-api'
import { rows, text, type RecordValue } from '../types'

/** Downloaded models are explicit engine/model actions, never an ambiguous second selector. */
export function InstalledLoad({
  disabled,
  query = '',
  models = [],
}: {
  disabled: boolean
  query?: string
  models?: WorkspaceServiceRow[]
}) {
  const [installed, setInstalled] = useState<RecordValue[]>([])
  const [reading, setReading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [readError, setReadError] = useState('')
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const pending = useRef(false)
  useEffect(() => {
    let active = true
    setReading(true)
    setReadError('')
    void workspaceApi.execute('models.installed').then(
      (value) => {
        if (active) {
          setInstalled(rows(value))
          setReading(false)
        }
      },
      (failure) => {
        if (active) {
          setReadError(describeError(failure))
          setReading(false)
        }
      }
    )
    return () => {
      active = false
    }
  }, [revision])
  const options = installed
    .flatMap((m) =>
      (Array.isArray(m.providers) ? m.providers.map(String) : [text(m.provider)])
        .filter(Boolean)
        .map((provider) => ({
          provider,
          id: text(m.id),
          name: text(m.name ?? m.id),
          key: `${provider}|${text(m.id)}`,
        }))
    )
    .filter(
      (m) =>
        !models.some(
          (service) =>
            service.provider === m.provider &&
            service.model === m.id &&
            ['ready', 'loaded', 'running', 'loading'].includes(service.state)
        )
    )
  const shown = options.filter((m) =>
    `${m.name} ${m.id} ${m.provider} ${engineName(m.provider)}`.toLowerCase().includes(query.toLowerCase())
  )
  return (
    <section className="installed-load" aria-label="Downloaded models">
      <h3>Downloaded</h3>
      {reading ? (
        <p className="model-picker-note" role="status">
          Checking downloaded models…
        </p>
      ) : readError ? (
        <div className="model-picker-feedback">
          <p role="alert">{readError}</p>
          <button type="button" className="ew-button" onClick={() => setRevision((v) => v + 1)}>
            Retry
          </button>
        </div>
      ) : (
        <>
          {!shown.length && (
            <p className="model-picker-note">
              {query
                ? 'No matching downloaded models.'
                : options.length
                  ? ''
                  : 'No other downloaded models. Browse the catalog to add one.'}
            </p>
          )}
          {shown.map((m) => (
            <button
              key={m.key}
              type="button"
              className="downloaded-model-row"
              aria-label={`Load ${m.name} with ${engineName(m.provider)}`}
              disabled={disabled || Boolean(loading)}
              onClick={async () => {
                if (pending.current) return
                pending.current = true
                setLoading(m.key)
                setError('')
                setNotice('')
                try {
                  await workspaceApi.execute('models.load', { provider: m.provider, model_id: m.id })
                  setNotice(`Load requested for ${m.name}. Select it above when ready.`)
                } catch (failure) {
                  setError(describeError(failure))
                } finally {
                  pending.current = false
                  setLoading('')
                }
              }}
            >
              <span>
                <strong>{m.name}</strong>
                <small>{engineName(m.provider)}</small>
              </span>
              <span className="model-row-action">
                {loading === m.key ? 'Loading…' : 'Load'}
                {loading !== m.key && <ArrowUpRight size={14} aria-hidden="true" />}
              </span>
            </button>
          ))}
        </>
      )}
      {error && (
        <p className="model-picker-feedback ew-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="model-picker-feedback" role="status">
          {notice}
        </p>
      )}
    </section>
  )
}
