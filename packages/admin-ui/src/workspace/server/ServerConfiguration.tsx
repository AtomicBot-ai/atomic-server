// Lifted from Atomic-Chat/web-app/src/containers/server-concept/Settings.tsx @ 5043013; adapted: persistent API settings and named keyring.
import { watchSharedRead } from '../watch-shared-read'
import { useEffect, useId, useRef, useState } from 'react'
import type { Workspace } from '../useWorkspace'
import { Action, Field } from '../Controls'
import { record, text } from '../types'
import type { RecordValue } from '../types'
import { describeError } from '@/services/admin-api'
import { ServerKeyField } from './ServerKeyField'

export function ServerConfiguration({
  workspace: w,
  openKeys,
}: {
  workspace: Workspace
  openKeys?: () => void
}) {
  const [saved, setSaved] = useState<RecordValue | null>(null)
  const [draft, setDraft] = useState<RecordValue>({})
  const [notice, setNotice] = useState('')
  const [hostsText, setHostsText] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const fieldId = useId()
  const { execute } = w
  const previous = useRef<RecordValue>({})
  useEffect(() => {
    setError('')
    return watchSharedRead(
      () => execute('config.get'),
      (result) => {
        const api = record(record(record(result).values).api)
        const before = previous.current
        previous.current = api
        setSaved(api)
        setDraft((current) => ({
          ...api,
          ...Object.fromEntries(
            Object.entries(current).filter(
              ([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key])
            )
          ),
        }))
        setError('')
      },
      (e) => setError(describeError(e))
    )
  }, [execute, revision])
  const storedValue = (key: string, value: unknown) =>
    key === 'port' && value !== '' ? Number(value) : value
  const changes = Object.fromEntries(
    Object.entries(draft)
      .filter(
        ([key, value]) =>
          JSON.stringify(storedValue(key, value)) !== JSON.stringify(storedValue(key, saved?.[key]))
      )
      .map(([key, value]) => [`api.${key}`, storedValue(key, value)])
  )
  const dirty = Object.keys(changes).length > 0
  const change = (key: string, value: unknown) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setNotice('')
  }
  const port = Number(draft.port)
  const portError =
    text(draft.port, '').trim() === '' || !Number.isInteger(port) || port < 0 || port > 65535
      ? 'Enter a whole number from 0 to 65535. Use 0 to choose a free port.'
      : ''
  const prefixError = text(draft.prefix, '').startsWith('/')
    ? ''
    : 'Start the API prefix with /, for example /v1.'
  const valid = !portError && !prefixError
  return (
    <section className="server-settings" aria-label="Server configuration">
      {error && (
        <p className="ew-error" role="alert">
          {error}
          <Action onClick={() => setRevision((n) => n + 1)}>Retry</Action>
        </p>
      )}
      {!saved && !error && <p role="status">Loading configuration…</p>}
      {saved && (
        <>
          <fieldset disabled={saving} className="server-settings-panel">
            <Field label="Host">
              <select value={text(draft.host, '127.0.0.1')} onChange={(e) => change('host', e.target.value)}>
                <option value="127.0.0.1">This device only · 127.0.0.1</option>
                <option value="0.0.0.0">Local network · 0.0.0.0</option>
                {!['127.0.0.1', '0.0.0.0'].includes(text(draft.host, '')) && (
                  <option value={text(draft.host)}>{text(draft.host)}</option>
                )}
              </select>
            </Field>
            <div className="form-grid">
              <div>
                <Field label="Port">
                  <input
                    type="number"
                    min={0}
                    max={65535}
                    step={1}
                    aria-invalid={Boolean(portError)}
                    aria-describedby={portError ? `${fieldId}-port-error` : undefined}
                    value={String(draft.port ?? 1337)}
                    onWheel={(event) => event.currentTarget.blur()}
                    onChange={(e) => change('port', e.target.value)}
                  />
                </Field>
                {portError && (
                  <p id={`${fieldId}-port-error`} className="ew-error" role="alert">
                    {portError}
                  </p>
                )}
              </div>
              <div>
                <Field label="API prefix">
                  <input
                    value={String(draft.prefix ?? '/v1')}
                    onChange={(e) => change('prefix', e.target.value)}
                    aria-invalid={Boolean(prefixError)}
                    aria-describedby={prefixError ? `${fieldId}-prefix-error` : undefined}
                  />
                </Field>
                {prefixError && (
                  <p id={`${fieldId}-prefix-error`} className="ew-error" role="alert">
                    {prefixError}
                  </p>
                )}
              </div>
            </div>
            <ServerKeyField workspace={w} openKeys={openKeys} />
            <label className="server-switch">
              <span>
                <strong>Start automatically</strong>
                <small>Start the API when the server process starts.</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={Boolean(draft.autoStart)}
                onChange={(e) => change('autoStart', e.target.checked)}
              />
            </label>
          </fieldset>
          <details className="server-advanced">
            <summary>Advanced settings</summary>
            <Field label="Trusted hosts" hint="Additional hostnames allowed to reach this API.">
              <input
                disabled={saving}
                value={hostsText ?? (Array.isArray(draft.trustedHosts) ? draft.trustedHosts.join(', ') : '')}
                onChange={(e) => {
                  setHostsText(e.target.value)
                  change(
                    'trustedHosts',
                    e.target.value
                      .split(',')
                      .map((v) => v.trim())
                      .filter(Boolean)
                  )
                }}
              />
            </Field>
          </details>
          {dirty && (
            <div className="server-save-bar">
              <span>{w.snapshot?.api.running ? 'Saving changes restarts the API.' : 'Unsaved changes'}</span>
              <Action
                disabled={saving}
                onClick={() => {
                  setDraft(saved)
                  setHostsText(undefined)
                  setNotice('')
                }}
              >
                Discard
              </Action>
              <Action
                primary
                disabled={saving || !valid}
                onClick={async () => {
                  setSaving(true)
                  try {
                    await execute('config.update', { values: changes })
                    if (w.snapshot?.api.running) await execute('api.restart')
                    previous.current = draft
                    setSaved(draft)
                    setHostsText(undefined)
                    setNotice('Changes saved.')
                    await w.refresh()
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                Save changes
              </Action>
            </div>
          )}
          {notice && <p role="status">{notice}</p>}
        </>
      )}
    </section>
  )
}
