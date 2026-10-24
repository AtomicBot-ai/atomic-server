// Lifted from atomic-chat-ui containers/connectors/ConnectorCard.tsx @ 807b4d9; adapted: shared runtime status and accessible controls.
import { useEffect, useRef } from 'react'
import { MoreVertical, Plug } from 'lucide-react'
import type { ConnectorConfig, ConnectorStatus, ConnectorTemplate } from '@contract'
import { Action } from '../Controls'
export function ConnectorCard({
  template,
  config,
  status,
  busy,
  setup,
  toggle,
  edit,
  json,
  tools,
  remove,
  signin,
}: {
  template?: ConnectorTemplate
  config?: ConnectorConfig
  status?: ConnectorStatus
  busy: boolean
  setup: () => void
  toggle: () => void
  edit: () => void
  json: () => void
  tools: () => void
  remove: () => void
  signin: () => void
}) {
  const menu = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (menu.current?.open && !menu.current.contains(event.target as Node)) menu.current.open = false
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu.current?.open) {
        menu.current.open = false
        event.preventDefault()
        event.stopImmediatePropagation()
        menu.current.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', escape, true)
    }
  }, [])
  const name = template?.name ?? config?.name ?? '',
    connected = config?.enabled && status?.state === 'connected'
  return (
    <article className="mcp-card">
      <header>
        <span className="mcp-icon" style={{ background: template?.icon.bg }}>
          {template?.icon.src ? <img src={template.icon.src} alt="" /> : <Plug size={24} />}
        </span>
        <div className="mcp-identity">
          <h3>{name}</h3>
          <small>
            {config
              ? busy
                ? 'Connecting…'
                : !config.enabled
                  ? 'Inactive'
                  : connected
                    ? 'Connected'
                    : status?.state === 'error'
                      ? 'Error'
                      : 'Inactive'
              : `By ${template?.author}`}
          </small>
        </div>
        {config ? (
          <div className="mcp-card-controls">
            <details ref={menu} className="mcp-menu">
              <summary aria-label={`${name} actions`}>
                <MoreVertical size={18} />
              </summary>
              <div
                onClick={() => {
                  if (menu.current) menu.current.open = false
                }}
              >
                <button onClick={edit}>Edit</button>
                <button onClick={json}>Edit JSON</button>
                <button onClick={tools}>Tools ({status?.tools.length ?? 0})</button>
                <button disabled={busy || !config.enabled} onClick={setup}>
                  Reconnect
                </button>
                {template?.auth === 'oauth' && (
                  <button disabled={busy} onClick={signin}>
                    Sign in
                  </button>
                )}
                <button onClick={remove}>Delete</button>
              </div>
            </details>
            <input
              type="checkbox"
              role="switch"
              aria-label={`Enable ${name}`}
              checked={config.enabled}
              disabled={busy}
              onChange={toggle}
            />
          </div>
        ) : (
          <Action primary disabled={busy || template?.auth === 'oauth-soon'} onClick={setup}>
            {busy ? 'Connecting…' : template?.auth ? 'Sign in' : 'Set Up'}
          </Action>
        )}
      </header>
      <p>
        {template?.description ??
          (config?.type === 'stdio' ? [config.command, ...config.args].join(' ') : config?.url)}
      </p>
      {status?.error && config?.enabled && (
        <p className="mcp-error" role="alert">
          {status.error}
        </p>
      )}
    </article>
  )
}
