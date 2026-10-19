import { useCallback, useEffect, useState } from 'react'
import { LIBRARY_SECTIONS } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action, Empty, Field, Panel } from '../Controls'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
import { describeError } from '@/services/admin-api'
import { ModelInstall } from './ModelInstall'
import { Downloads } from './Downloads'
import { EngineSettings } from './EngineSettings'
import { InstalledModels } from './InstalledModels'

export function Catalog({
  workspace: w,
  openCommand,
}: {
  workspace: Workspace
  openCommand: (name: string) => void
}) {
  const [tab, setTab] = useState('installed')
  const [category, setCategory] = useState('text')
  const [query, setQuery] = useState('')
  const [catalog, setCatalog] = useState<RecordValue[]>([])
  const [installed, setInstalled] = useState<RecordValue[]>([])
  const [engines, setEngines] = useState<RecordValue[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<RecordValue | null>(null)
  const [settingsProvider, setSettingsProvider] = useState('')
  const { execute } = w
  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (tab === 'engines') setEngines(rows(await execute('engines.list')))
      else if (tab === 'installed') {
        const [chat, media] = await Promise.all([execute('models.installed'), execute('artifacts.list')])
        setInstalled([...rows(chat), ...rows(media).filter((model) => model.stage === 'ready')])
      } else if (tab === 'catalog') setCatalog(rows(await execute('models.catalog', { category })))
    } catch (e) {
      setError(describeError(e))
    } finally {
      setLoading(false)
    }
  }, [tab, category, execute])
  useEffect(() => {
    void refresh()
  }, [refresh])
  const filtered = catalog
    .filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) =>
      query
        ? Number(/^AtomicChat\//i.test(text(b.id ?? b.repo))) -
          Number(/^AtomicChat\//i.test(text(a.id ?? a.repo)))
        : 0
    )
  return (
    <div>
      <div className="page-heading">
        <h1>Engines & Models</h1>
        <Action onClick={refresh}>Refresh</Action>
      </div>
      <nav className="subnav" aria-label="Catalog sections">
        {LIBRARY_SECTIONS.map(({ id, label }) => (
          <button
            key={id}
            className={id === tab ? 'active' : ''}
            aria-current={id === tab ? 'page' : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <p className="ew-error" role="alert">
          {error}
        </p>
      )}
      {tab === 'catalog' && (
        <>
          <div className="catalog-filters">
            <Field label="Task">
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value)
                  setQuery('')
                }}
              >
                <option value="text">Chat & vision</option>
                <option value="image">Images</option>
                <option value="video">Video</option>
                <option value="embedding">Embeddings</option>
                <option value="decision">Decisions & routing</option>
              </select>
            </Field>
            <Field label="Filter catalog">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, family or quantization"
              />
            </Field>
            {category === 'text' && (
              <Action
                disabled={!query.trim()}
                onClick={async () => setCatalog(rows(await execute('models.search', { query })))}
              >
                Search Hugging Face
              </Action>
            )}
          </div>
          {loading ? (
            <Empty>Loading catalog…</Empty>
          ) : filtered.length ? (
            <div className="model-grid">
              {filtered.map((model, i) => (
                <article className="model-card" key={text(model.id ?? model.model_name, String(i))}>
                  <span className="eyebrow">{text(model.family ?? model.format, category)}</span>
                  <h3>{text(model.title ?? model.name ?? model.id ?? model.model_name)}</h3>
                  <p>{text(model.summary ?? model.description, '')}</p>
                  <small>{text(model.id ?? model.repo ?? model.model_name, '')}</small>
                  <Action onClick={() => setSelected(model)}>Choose model</Action>
                </article>
              ))}
            </div>
          ) : (
            <Empty>No models match this filter.</Empty>
          )}
        </>
      )}
      {tab === 'installed' && (
        <InstalledModels
          workspace={w}
          installed={installed}
          loading={loading}
          openCommand={openCommand}
          browse={() => setTab('catalog')}
        />
      )}
      {tab === 'engines' && (
        <>
          {loading ? (
            <Empty>Checking engines…</Empty>
          ) : (
            engines.map((engine) => (
              <Panel
                key={text(engine.engine)}
                title={text(engine.engine)}
                actions={
                  <Action onClick={() => execute('engines.install', { engine: engine.engine })}>
                    {engine.active ? 'Update' : 'Install'}
                  </Action>
                }
              >
                <p className="ew-muted">
                  {text(engine.kind)} ·{' '}
                  {engine.active ? `Active: ${text(record(engine.active).version)}` : 'Not installed'}
                </p>
                {Boolean(engine.source_error) && <p className="ew-muted">{text(engine.source_error)}</p>}
                {rows(engine.builds).map((build) => (
                  <div className="installed-row" key={`${text(build.version)}-${text(build.variant)}`}>
                    <div>
                      <strong>{text(build.version)}</strong>
                      <small>
                        {text(build.variant)}
                        {build.in_use ? ' · In use' : ''}
                      </small>
                    </div>
                    <div className="ew-actions">
                      <Action
                        disabled={Boolean(build.active) || engine.active_choice !== 'client'}
                        onClick={() =>
                          execute('engines.activate', {
                            engine: engine.engine,
                            version: build.version,
                            variant: build.variant,
                          })
                        }
                      >
                        {build.active ? 'Active' : 'Activate'}
                      </Action>
                      <Action
                        disabled={!build.removable}
                        title={text(build.not_removable_reason, '')}
                        onClick={() => {
                          if (window.confirm('Remove this engine build?'))
                            return execute('engines.remove', {
                              engine: engine.engine,
                              version: build.version,
                              variant: build.variant,
                            })
                        }}
                      >
                        Remove
                      </Action>
                    </div>
                  </div>
                ))}
                <Action onClick={() => setSettingsProvider(text(engine.engine))}>Engine settings</Action>
              </Panel>
            ))
          )}
        </>
      )}
      {tab === 'downloads' && <Downloads workspace={w} />}
      {settingsProvider && (
        <EngineSettings provider={settingsProvider} workspace={w} onClose={() => setSettingsProvider('')} />
      )}
      {selected && (
        <ModelInstall
          model={selected}
          category={category}
          execute={execute}
          onClose={() => setSelected(null)}
          onStarted={() => setTab('downloads')}
        />
      )}
    </div>
  )
}
