import { useConfirmation } from '../use-confirmation'
import { DeleteConfirmation } from './DeleteConfirmation'
import { useState } from 'react'
import { engineName, loadStageText } from '@view'
import { describeError } from '@/services/admin-api'
import { Action, Empty, Field, Panel } from '../Controls'
import { record, text } from '../types'
import type { RecordValue } from '../types'
import type { Workspace } from '../useWorkspace'
import { modelCategory, modelId, modelProviders } from './catalog-models'
export function InstalledModels({
  workspace: w,
  installed,
  loading,
  openCommand,
  browse,
  onChanged,
  compact = false,
}: {
  compact?: boolean
  workspace: Workspace
  installed: RecordValue[]
  loading: boolean
  openCommand: (name: string) => void
  browse: () => void
  onChanged?: () => void
}) {
  const { ask, confirmation, waiting } = useConfirmation()
  const [chosen, setChosen] = useState<Record<string, string>>({}),
    [query, setQuery] = useState('')
  const [pending, setPending] = useState('')
  const [removing, setRemoving] = useState<RecordValue | null>(null)
  const [failures, setFailures] = useState<Record<string, string>>({})
  const [logs, setLogs] = useState<Record<string, string>>({})
  const services = w.snapshot?.services ?? []
  const unload = (service: (typeof services)[number]) =>
    ask({
      title: `Unload ${service.model}?`,
      actionLabel: 'Unload model',
      danger: true,
      children: <p>Active generation may be interrupted.</p>,
      onConfirm: () =>
        service.kind === 'chat'
          ? w.execute('models.unload', { provider: service.provider, model_id: service.model })
          : w.execute(service.kind === 'image-video' ? 'media.unload' : `media.${service.kind}.unload`),
    })
  return (
    <>
      {confirmation}
      {!compact && (
        <div className="ew-actions">
          <Field label="Search installed models">
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </Field>
          <Action onClick={() => openCommand('models.import')}>Import local model</Action>
          <Action onClick={browse}>Find models</Action>
        </div>
      )}
      {!compact && (
        <p className="ew-muted">
          {installed.length} installed model(s). Installed files become available to your agent after loading
          and starting the API.
        </p>
      )}
      {loading ? (
        <Empty>Reading installed models…</Empty>
      ) : (
        installed
          .filter((m) => JSON.stringify(m).toLowerCase().includes(query.toLowerCase()))
          .map((row, i) => {
            const id = text(row.id ?? row.model_id, String(i))
            // The providers the core says list this model (`models.installed`), never a list kept here.
            const providers = modelProviders(row)
            const selectedEngine = chosen[id] ?? providers[0] ?? ''
            const model = modelId(row)
            const category = modelCategory(row)
            const artifact = Boolean(record(row.plan).category || (row.stage && row.category))
            const kind = ['image', 'video'].includes(category)
              ? 'image-video'
              : category === 'text'
                ? 'chat'
                : category
            const loaded = services.find(
              (s) =>
                s.model === model && s.kind === kind && (category !== 'text' || s.provider === selectedEngine)
            )
            // A managed engine's load reports its stage; the elapsed time goes on from when it was seen.
            const load = w.snapshot?.loads?.find((l) => l.model_id === model && l.provider === selectedEngine)
            const stage = load
              ? loadStageText({ ...load, elapsed_ms: load.elapsed_ms + Math.max(0, Date.now() - load.at) })
              : ''
            const state = stage || (pending === id ? 'Loading' : (loaded?.state ?? 'Installed · not loaded'))
            const loadModel = async () => {
              setPending(id)
              setFailures((f) => ({ ...f, [id]: '' }))
              try {
                if (artifact) await w.execute('artifacts.load', { id: row.id })
                else await w.execute('models.load', { provider: selectedEngine, model_id: model })
              } catch (error) {
                setFailures((f) => ({ ...f, [id]: describeError(error) }))
                throw error
              } finally {
                setPending('')
              }
            }
            return (
              <article className="installed-row" key={id}>
                <div>
                  <strong>{text(row.name ?? row.title ?? record(row.plan).name ?? row.id)}</strong>
                  <small>
                    {engineName(selectedEngine)} · {state}
                  </small>
                  {providers.length > 1 && !artifact && (
                    <select
                      aria-label={`Load ${id} with`}
                      value={selectedEngine}
                      onChange={(e) => setChosen((c) => ({ ...c, [id]: e.target.value }))}
                    >
                      {providers.map((p) => (
                        <option key={p} value={p}>
                          {engineName(p)}
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
                      waiting ||
                      Boolean(pending) ||
                      Boolean(loaded && ['ready', 'running', 'loaded'].includes(loaded.state))
                    }
                    onClick={() => {
                      if (services.length)
                        ask({
                          title: `Load ${text(row.name ?? model)}?`,
                          actionLabel: 'Load model',
                          children: <p>Loading may replace a model using the same GPU.</p>,
                          onConfirm: loadModel,
                        })
                      else return loadModel().catch(() => undefined)
                    }}
                  >
                    {loaded && ['ready', 'running', 'loaded'].includes(loaded.state) ? 'Ready' : 'Load model'}
                  </Action>
                  {compact && loaded && (
                    <Action disabled={waiting || Boolean(pending)} onClick={() => unload(loaded)}>
                      Unload
                    </Action>
                  )}
                  <Action danger disabled={Boolean(pending) || waiting} onClick={() => setRemoving(row)}>
                    × Delete
                  </Action>
                  {failures[id] && category === 'text' && selectedEngine && (
                    <Action
                      onClick={async () => {
                        try {
                          const log = await w.execute('models.logs', {
                            provider: selectedEngine,
                            model_id: model,
                          })
                          setLogs((l) => ({
                            ...l,
                            [id]: typeof log === 'string' ? log : JSON.stringify(log),
                          }))
                        } catch (error) {
                          setFailures((f) => ({ ...f, [id]: describeError(error) }))
                        }
                      }}
                    >
                      View log
                    </Action>
                  )}
                  {(load || pending === id || loaded?.state === 'loading') &&
                    category === 'text' &&
                    selectedEngine && (
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
      {removing && (
        <DeleteConfirmation
          title="Delete model?"
          name={text(removing.name ?? record(removing.plan).name ?? removing.id)}
          detail={
            removing.store === 'managed'
              ? 'This deletes the model for every engine using the shared store.'
              : 'Its files will be deleted. Unload the model before deleting it.'
          }
          confirm="Delete model"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            if (removing.category || record(removing.plan).category)
              await w.execute('downloads.remove', { id: removing.id, owner: 'artifacts', installed: true })
            else await w.execute('models.remove', { model_id: removing.model_id ?? removing.id })
            onChanged?.()
          }}
        />
      )}
      {!compact && (
        <Panel title="Loaded services">
          {!services.length && <Empty>No services loaded.</Empty>}
          {services.map((service) => (
            <div className="installed-row" key={service.id}>
              <div>
                <strong>{service.model}</strong>
                <small>
                  {engineName(service.provider)} · {service.kind} · {service.state}
                </small>
              </div>
              <Action danger disabled={waiting || Boolean(pending)} onClick={() => unload(service)}>
                Unload
              </Action>
            </div>
          ))}
        </Panel>
      )}
    </>
  )
}
