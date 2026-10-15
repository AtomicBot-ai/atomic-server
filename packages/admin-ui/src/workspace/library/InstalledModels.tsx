import { useState } from 'react'
import { Action, Empty, Field, Panel } from '../Controls'
import { record, text } from '../types'
import type { RecordValue } from '../types'
import type { Workspace } from '../useWorkspace'
export function InstalledModels({
  workspace: w,
  installed,
  loading,
  openCommand,
  browse,
}: {
  workspace: Workspace
  installed: RecordValue[]
  loading: boolean
  openCommand: (name: string) => void
  browse: () => void
}) {
  const [provider, setProvider] = useState('llamacpp-upstream'),
    [query, setQuery] = useState('')
  const [pending, setPending] = useState('')
  const services = w.snapshot?.services ?? []
  return (
    <>
      <div className="ew-actions">
        <Field label="Load with engine">
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            {['llamacpp-upstream', 'llamacpp', 'atomic-prism', 'mlx', 'vllm', 'tensorrt-llm'].map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </Field>
        <Field label="Search installed models">
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </Field>
        <Action onClick={() => openCommand('models.import')}>Import local model</Action>
        <Action onClick={browse}>Find models</Action>
      </div>
      <p className="ew-muted">
        {installed.length} installed model(s). Installed files become available to your agent after loading
        and starting the API.
      </p>
      {loading ? (
        <Empty>Reading installed models…</Empty>
      ) : (
        installed
          .filter((m) => JSON.stringify(m).toLowerCase().includes(query.toLowerCase()))
          .map((row, i) => {
            const id = text(row.id ?? row.model_id, String(i)),
              engine = text(row.provider, provider)
            const selectedEngine =
              row.provider === 'atomic-prism' || row.provider === 'mlx' ? engine : provider
            const model = text(row.model_id ?? record(row.plan).model_id ?? row.id)
            const loaded = services.find(
              (s) => s.model === model && (row.category || s.provider === selectedEngine)
            )
            const state = pending === id ? 'Loading' : (loaded?.state ?? 'Installed · not loaded')
            return (
              <article className="installed-row" key={id}>
                <div>
                  <strong>{text(row.name ?? row.title ?? record(row.plan).name ?? row.id)}</strong>
                  <small>
                    {selectedEngine} · {state}
                  </small>
                  <details>
                    <summary>Model details</summary>
                    <code>{model}</code>
                    <p>Downloaded files are kept when a model is unloaded.</p>
                  </details>
                </div>
                <div className="ew-actions">
                  <Action
                    disabled={
                      Boolean(pending) ||
                      Boolean(loaded && ['ready', 'running', 'loaded'].includes(loaded.state))
                    }
                    onClick={async () => {
                      if (
                        services.length &&
                        !window.confirm('Loading may replace a model using the same GPU. Continue?')
                      )
                        return
                      setPending(id)
                      try {
                        if (row.category || record(row.plan).category)
                          await w.execute('artifacts.load', { id: row.id })
                        else await w.execute('models.load', { provider: selectedEngine, model_id: model })
                      } finally {
                        setPending('')
                      }
                    }}
                  >
                    {loaded && ['ready', 'running', 'loaded'].includes(loaded.state) ? 'Ready' : 'Load model'}
                  </Action>
                  {(pending === id || loaded?.state === 'loading') && !row.category && (
                    <Action
                      onClick={() =>
                        w.execute('models.cancel', { provider: selectedEngine, model_id: model })
                      }
                    >
                      Cancel loading
                    </Action>
                  )}
                </div>
              </article>
            )
          })
      )}
      {!loading && !installed.length && (
        <Empty>No models installed. Find a model or import a local file.</Empty>
      )}
      <Panel title="Loaded services">
        {!services.length && <Empty>No services loaded.</Empty>}
        {services.map((service) => (
          <div className="installed-row" key={service.id}>
            <div>
              <strong>{service.model}</strong>
              <small>
                {service.provider} · {service.kind} · {service.state}
              </small>
            </div>
            <Action
              danger
              onClick={() => {
                if (!window.confirm(`Unload ${service.model}? Active generation may be interrupted.`)) return
                return service.kind === 'chat'
                  ? w.execute('models.unload', { provider: service.provider, model_id: service.model })
                  : w.execute(
                      service.kind === 'image-video' ? 'media.unload' : `media.${service.kind}.unload`
                    )
              }}
            >
              Unload
            </Action>
          </div>
        ))}
      </Panel>
    </>
  )
}
