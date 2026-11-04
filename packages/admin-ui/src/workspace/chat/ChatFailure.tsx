import { AlertCircle } from 'lucide-react'
import { Action } from '../Controls'

/** Recovery labels describe the destination; credential repair must not just reload the page. */
export function ChatFailure({ error, onCatalog }: { error: string; onCatalog: (section?: string) => void }) {
  const credentials = /\b(401|403|unauthorized|authentication|credentials?|api[ _-]?key)\b/i.test(error)
  const disconnected = /\b(network|fetch|connection|disconnected|unreachable)\b/i.test(error)
  const summary = credentials
    ? 'The provider rejected the request. Check its credentials and retry.'
    : error.split('\n')[0]!.slice(0, 180)
  return (
    <div className="ew-error chat-failure" role="alert">
      <div className="chat-failure-title">
        <AlertCircle size={18} aria-hidden="true" />
        <span>{summary}</span>
      </div>
      <details>
        <summary>Error details</summary>
        <pre>{error}</pre>
      </details>
      <div className="ew-actions">
        <Action onClick={() => onCatalog(credentials ? 'cloud' : undefined)}>
          {credentials ? 'Reconnect provider' : 'Engines & Models'}
        </Action>
        {disconnected && <Action onClick={() => window.location.reload()}>Reconnect to server</Action>}
      </div>
    </div>
  )
}
