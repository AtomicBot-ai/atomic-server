// Lifted from Atomic-Chat preview/onboarding/Onboarding.tsx @ 5043013; adapted: live provider validation and advanced endpoints.
import { useEffect, useRef } from 'react'
import { CLOUD_CONNECTION_NOTES } from '@contract'
import { Action, Field } from '../Controls'
import type { RecordValue } from '../types'

type Connection = { provider: string; url: string; key: string; models: string }
export function CloudProviderEditor({
  name,
  onboarding,
  checking,
  error,
  validUrl,
  saved,
  optionsOpen,
  value,
  change,
  connect,
  close,
  disconnect,
}: {
  name: string
  onboarding: boolean
  checking: boolean
  error: string
  validUrl: boolean
  saved?: RecordValue
  optionsOpen: boolean
  value: Connection
  change: (field: keyof Connection, value: string) => void
  connect: () => Promise<void>
  close: () => void
  disconnect: () => Promise<void>
}) {
  const form = useRef<HTMLFormElement>(null)
  const submitted = useRef<{ moved: boolean } | null>(null)
  useEffect(() => {
    const moved = (event: FocusEvent) => {
      if (
        submitted.current &&
        event.target !== document.body &&
        !form.current?.contains(event.target as Node)
      )
        submitted.current.moved = true
    }
    document.addEventListener('focusin', moved)
    return () => document.removeEventListener('focusin', moved)
  }, [])
  useEffect(() => {
    if (checking || !submitted.current) return
    if (
      error &&
      !submitted.current.moved &&
      (document.activeElement === document.body || form.current?.contains(document.activeElement))
    )
      form.current?.querySelector<HTMLInputElement>('input[type="password"]')?.focus()
    submitted.current = null
  }, [checking, error])
  const needsKey = [
    'openai',
    'anthropic',
    'google',
    'openrouter',
    'chatgpt',
    'deepseek',
    'xai',
    'groq',
    'mistral',
    'azure',
  ].includes(value.provider)
  const connectButton = (
    <button
      type="submit"
      className="ew-button primary"
      disabled={!value.provider.trim() || !validUrl || (needsKey && !value.key.trim())}
    >
      {checking ? (
        <>
          <i className="cloud-check-spinner" /> Checking connection…
        </>
      ) : (
        'Connect'
      )}
    </button>
  )
  return (
    <form
      ref={form}
      className="cloud-provider-editor"
      onSubmit={(event) => {
        event.preventDefault()
        submitted.current = { moved: false }
        void connect()
      }}
    >
      {error && (
        <p role="alert" className="ew-error">
          {error}
        </p>
      )}
      <fieldset disabled={checking}>
        <legend>{name}</legend>
        {CLOUD_CONNECTION_NOTES[value.provider] && (
          <p className="cloud-connection-note">{CLOUD_CONNECTION_NOTES[value.provider]}</p>
        )}
        <div className="cloud-key-row">
          <Field
            label="API key"
            hint={saved?.has_api_key ? 'Enter the key again to check this connection.' : undefined}
          >
            <input
              type="password"
              autoComplete="off"
              value={value.key}
              onChange={(event) => change('key', event.target.value)}
            />
          </Field>
          {onboarding && connectButton}
        </div>
        <details open={optionsOpen}>
          <summary>Connection options</summary>
          <div className="form-grid">
            <Field label="Provider name">
              <input
                autoComplete="off"
                value={value.provider}
                onChange={(event) => change('provider', event.target.value)}
                placeholder="Provider ID"
              />
            </Field>
            <Field
              label="Base URL"
              hint={
                value.url && !validUrl
                  ? 'Use HTTP or HTTPS without URL credentials, a query, or a fragment.'
                  : 'Required. OpenAI-compatible endpoint.'
              }
            >
              <input
                value={value.url}
                aria-invalid={Boolean(value.url && !validUrl)}
                onChange={(event) => change('url', event.target.value)}
                placeholder="https://provider.example/v1"
              />
            </Field>
            <Field label="Model IDs" hint="Leave empty to discover models, or separate IDs with commas.">
              <input value={value.models} onChange={(event) => change('models', event.target.value)} />
            </Field>
          </div>
        </details>
        <div className="ew-actions">
          {!onboarding && connectButton}
          {!onboarding && <Action onClick={close}>Cancel</Action>}
          {!onboarding && saved && <Action onClick={disconnect}>Disconnect</Action>}
        </div>
      </fieldset>
    </form>
  )
}
