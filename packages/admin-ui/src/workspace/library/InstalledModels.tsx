import { useState } from 'react'
import { loadStageText } from '@view'
import { describeError } from '@/services/admin-api'
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
  onChanged,
}: {
  workspace: Workspace
  installed: RecordValue[]
  loading: boolean
  openCommand: (name: string) => void
  browse: () => void
  onChanged?: () => void
}) {
  const [chosen, setChosen] = useState<Record<string, string>>({}),
    [query, setQuery] = useState('')
  const [pending, setPending] = useState('')
  const [failures, setFailures] = useState<Record<string, string>>({})
  const [logs, setLogs] = useState<Record<string, string>>({})
  const services = w.snapshot?.services ?? []
  return (
    <>
      <div className="ew-actions">
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
            const id = text(row.id ?? row.model_id, String(i))
            // The providers the core says list this model (`models.installed`), never a list kept here.
            const providers = Array.isArray(row.providers)
              ? row.providers.map(String)
              : row.provider
                ? [text(row.provider)]
                : []
            const selectedEngine = chosen[id] ?? providers[0] ?? ''
            const model = text(row.model_id ?? record(row.plan).model_id ?? row.id)
            const loaded = services.find(
              (s) => s.model === model && (row.category || s.provider === selectedEngine)
            )
            // A managed engine's load reports its stage; the elapsed time goes on from when it was seen.
            const load = w.snapshot?.loads?.find((l) => l.model_id === model && l.provider === selectedEngine)
            const stage = load
              ? loadStageText({ ...load, elapsed_ms: load.elapsed_ms + Math.max(0, Date.now() - load.at) })
              : ''
            const state = stage || (pending === id ? 'Loading' : (loaded?.state ?? 'Installed · not loaded'))
            return (
              <article className="installed-row" key={id}>
                <div>
                  <strong>{text(row.name ?? row.title ?? record(row.plan).name ?? row.id)}</strong>
                  <small>
                    {selectedEngine} · {state}
                  </small>
                  {providers.length > 1 && !row.category && (
                    <select
                      aria-label={`Load ${id} with`}
                      value={selectedEngine}
                      onChange={(e) => setChosen((c) => ({ ...c, [id]: e.target.value }))}
                    >
                      {providers.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  )}
                  {failures[id] && (
                    <p role="alert" className="inline-error">
                      {failures[id]}
                    </p>
                  )}
                  {logs[id] && <pre className="model-log">{logs[id]}</pre>}
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
                      setFailures((f) => ({ ...f, [id]: '' }))
                      try {
                        if (row.category || record(row.plan).category)
                          await w.execute('artifacts.load', { id: row.id })
                        else await w.execute('models.load', { provider: selectedEngine, model_id: model })
                      } catch (e) {
                        setFailures((f) => ({ ...f, [id]: describeError(e) }))
                      } finally {
                        setPending('')
                      }
                    }}
                  >
                    {loaded && ['ready', 'running', 'loaded'].includes(loaded.state) ? 'Ready' : 'Load model'}
                  </Action>
                  {!row.category && (
                    <Action
                      danger
                      disabled={Boolean(pending)}
                      onClick={async () => {
                        const warning =
                          row.store === 'managed'
                            ? `${id} is in the managed engines' shared store: removing it removes it for every managed engine (${providers.join(', ')}), loaded or not.`
                            : `Remove ${id}? A loaded model is unloaded first.`
                        if (!window.confirm(warning)) return
                        await w.execute('models.remove', { model_id: model })
                        onChanged?.()
                      }}
                    >
                      Remove
                    </Action>
                  )}
                  {failures[id] && (
                    <Action
                      onClick={async () => {
                        const log = await w.execute('models.logs', {
                          provider: selectedEngine,
                          model_id: model,
                        })
                        setLogs((l) => ({ ...l, [id]: typeof log === 'string' ? log : JSON.stringify(log) }))
                      }}
                    >
                      View log
                    </Action>
                  )}
                  {(load || pending === id || loaded?.state === 'loading') && !row.category && (
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
