import { useState } from 'react'
import type { ReactNode } from 'react'
import { describeError } from '@/services/admin-api'

export function Action({
  children,
  onClick,
  primary = false,
  danger = false,
  disabled = false,
  title,
  ariaLabel,
}: {
  children: ReactNode
  onClick: () => void | Promise<unknown>
  primary?: boolean
  danger?: boolean
  disabled?: boolean
  title?: string
  ariaLabel?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <span className="action-wrap">
      <button
        type="button"
        title={title}
        aria-label={ariaLabel}
        aria-busy={busy || undefined}
        disabled={busy || disabled}
        className={`ew-button ${primary ? 'primary' : ''} ${danger ? 'danger' : ''}`}
        onClick={() => {
          setBusy(true)
          setError('')
          Promise.resolve()
            .then(onClick)
            .catch((e) => setError(describeError(e)))
            .finally(() => setBusy(false))
        }}
      >
        <span className={busy ? 'action-label busy' : 'action-label'}>{children}</span>
        {busy && <span className="action-spinner" aria-hidden="true" />}
      </button>
      {error && (
        <span className="inline-error" role="alert">
          {error}
        </span>
      )}
    </span>
  )
}
export function Copy({
  value,
  label = 'Copy',
  secret = false,
  children,
}: {
  value: string | (() => Promise<string>)
  label?: string
  secret?: boolean
  children?: ReactNode
}) {
  const [copied, setCopied] = useState(false)
  return (
    <Action
      title={secret ? 'Copy API key to clipboard' : label}
      ariaLabel={copied ? 'Copied' : label}
      onClick={async () => {
        const content = typeof value === 'function' ? await value() : value
        if (!navigator.clipboard?.writeText)
          throw new Error('Clipboard unavailable. Select and copy the displayed value.')
        await navigator.clipboard.writeText(content)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      }}
    >
      {copied ? 'Copied' : (children ?? label)}
    </Action>
  )
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="ew-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}
export function Panel({
  title,
  children,
  actions,
}: {
  title: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <section className="ew-panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  )
}
export function JsonResult({ value }: { value: unknown }) {
  if (value === undefined || value === null) return null
  return (
    <pre className="json-result">{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre>
  )
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="ew-empty">{children}</p>
}
