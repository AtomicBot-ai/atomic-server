// Lifted from atomic-chat-ui ConnectorSecretDialog and EditJsonMCPserver @ 807b4d9; adapted: server-owned operations.
import { useState } from 'react'
import type { ConnectorTemplate } from '@contract'
import { Action, Field } from '../Controls'
import { useDialog } from '../useDialog'
export function ConnectorDialog({
  title,
  close,
  children,
}: {
  title: string
  close: () => void
  children: React.ReactNode
}) {
  const ref = useDialog(close)
  return (
    <div className="modal-shade">
      <section
        ref={ref}
        className="ew-modal connector-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  )
}
export function ConnectorSecret({
  template,
  close,
  connect,
}: {
  template: ConnectorTemplate
  close: () => void
  connect: (value: string) => Promise<void>
}) {
  const [secret, setSecret] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <ConnectorDialog
      title={`Connect ${template.name}`}
      close={() => {
        if (!busy) close()
      }}
    >
      <Field label={template.secret!.label}>
        <input
          type="password"
          autoComplete="off"
          value={secret}
          placeholder={template.secret!.placeholder}
          onChange={(e) => setSecret(e.target.value)}
        />
      </Field>
      {template.secret?.helpUrl && (
        <a href={template.secret.helpUrl} target="_blank" rel="noreferrer">
          Get your API key
        </a>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="ew-actions">
        <Action disabled={busy} onClick={close}>
          Cancel
        </Action>
        <Action
          primary
          disabled={busy || !secret.trim()}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              await connect(secret)
              close()
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Connecting…' : 'Connect'}
        </Action>
      </div>
    </ConnectorDialog>
  )
}
export function ConnectorJsonEditor({
  initial,
  close,
  save,
}: {
  initial: string
  close: () => void
  save: (value: string) => Promise<void>
}) {
  const [value, setValue] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <ConnectorDialog
      title="Edit MCP configuration"
      close={() => {
        if (!busy) close()
      }}
    >
      <Field label="Configuration (JSON)">
        <textarea
          className="connector-json"
          rows={16}
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>
      {error && <p role="alert">{error}</p>}
      <div className="ew-actions">
        <Action disabled={busy} onClick={close}>
          Cancel
        </Action>
        <Action
          primary
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              await save(value)
              close()
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Saving…' : 'Save'}
        </Action>
      </div>
    </ConnectorDialog>
  )
}

export function ConnectorSignIn({
  waiting,
  retry,
  cancel,
}: {
  waiting: { id: string; name: string; url: string; error?: string }
  retry: (clientId: string) => Promise<void>
  cancel: () => void
}) {
  const [clientId, setClientId] = useState(''),
    [busy, setBusy] = useState(false)
  return (
    <ConnectorDialog title={`Sign in to ${waiting.name}`} close={cancel}>
      {waiting.url ? (
        <>
          <p>Complete sign-in in your browser.</p>
          <a className="mcp-sign-in" href={waiting.url} target="_blank" rel="noreferrer">
            Open sign-in
          </a>
          <p role="status">Waiting for sign-in…</p>
        </>
      ) : (
        <>
          <p role="alert">{waiting.error}</p>
          <Field label="OAuth client ID (optional)">
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" />
          </Field>
        </>
      )}
      <div className="ew-actions">
        <Action onClick={cancel}>Cancel</Action>
        {!waiting.url && (
          <Action
            primary
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await retry(clientId)
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? 'Starting…' : 'Retry sign-in'}
          </Action>
        )}
      </div>
    </ConnectorDialog>
  )
}
