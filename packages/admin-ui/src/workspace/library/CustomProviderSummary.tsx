// Lifted from atomic-chat-ui/web-app/src/routes/endpoints.tsx @ 807b4d9; adapted: real provider state and concise empty state.
import { Network, Plus } from 'lucide-react'
import type { RecordValue } from '../types'
import { text } from '../types'
import { Action } from '../Controls'
import './custom-endpoints.css'
export function CustomProviderSummary({
  providers,
  edit,
  add,
}: {
  providers: RecordValue[]
  edit: (provider: RecordValue) => void
  add: () => void
}) {
  return (
    <section className="custom-provider-summary" aria-label="Custom endpoints">
      <header className="custom-endpoints-heading">
        <h1>Custom endpoints</h1>
        {providers.length > 0 && (
          <Action onClick={add}>
            <Plus size={16} />
            Add another one
          </Action>
        )}
      </header>
      {providers.length ? (
        <div className="custom-endpoints-list">
          {providers.map((provider) => (
            <article className="custom-endpoint-card" key={text(provider.provider)}>
              <Network size={22} aria-hidden="true" />
              <div className="custom-endpoint-info">
                <h2>{text(provider.provider)}</h2>
                <code>{text(provider.base_url)}</code>
                <span className="custom-endpoint-status">
                  {provider.connected === true ? '✓ Connected' : 'Not checked'}
                </span>
                {Array.isArray(provider.models) && provider.models.length > 0 && (
                  <p>{provider.models.map(String).join(', ')}</p>
                )}
              </div>
              <Action onClick={() => edit(provider)}>Edit connection</Action>
            </article>
          ))}
        </div>
      ) : (
        <div className="custom-endpoints-empty">
          <Network size={32} aria-hidden="true" />
          <p>Add an OpenAI-compatible endpoint.</p>
          <Action primary onClick={add}>
            <Plus size={16} />
            Add endpoint
          </Action>
        </div>
      )}
    </section>
  )
}
