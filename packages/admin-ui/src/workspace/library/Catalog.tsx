import { useCallback, useEffect, useState } from 'react'
import { LIBRARY_SECTIONS } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action, Empty, Field } from '../Controls'
import { rows, text } from '../types'
import type { RecordValue } from '../types'
import { describeError } from '@/services/admin-api'
import { ModelInstall } from './ModelInstall'
import { Downloads } from './Downloads'
import { EngineSettings } from './EngineSettings'
import { EngineSetup } from './EngineSetup'
import { EnginesTab } from './EnginesTab'
import { FoundryLocal } from './FoundryLocal'
import { FoundryModelInstall } from './FoundryModelInstall'
import { LiteRtLm } from './LiteRtLm'
import { LiteRtModelInstall } from './LiteRtModelInstall'
import { ManagedModelInstall } from './ManagedModelInstall'
import { catalogCards, catalogFormats, FORMAT_ENGINE } from './catalog-data'
import type { CatalogFormat } from './catalog-data'
import { useEngines } from '../useEngines'
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
  const [managed, setManaged] = useState('')
  const [accelerators, setAccelerators] = useState('')
  const [format, setFormat] = useState<CatalogFormat>('gguf')
  const [managedRepo, setManagedRepo] = useState('')
  const [managedEngine, setManagedEngine] = useState('')
  const { engines: registered } = useEngines(w.execute)
  const managedEngines = registered.filter((e) => e.kind === 'managed').map((e) => text(e.engine))
  const engineForModels = managedEngines.includes(managedEngine) ? managedEngine : (managedEngines[0] ?? '')
  const { execute } = w
  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (tab === 'engines') setEngines(rows(await execute('engines.list')))
      else if (tab === 'installed') {
        const [chat, media] = await Promise.all([execute('models.installed'), execute('artifacts.list')])
        setInstalled([...rows(chat), ...rows(media).filter((model) => model.stage === 'ready')])
      } else if (tab === 'catalog' && format === 'safetensors' && engineForModels)
        setCatalog(catalogCards(await execute('models.catalog', { engine: engineForModels }), format))
      else if (tab === 'catalog' && FORMAT_ENGINE[format])
        setCatalog(
          catalogCards(await execute('models.search', { engine: FORMAT_ENGINE[format], query: '' }), format)
        )
      else if (tab === 'catalog') setCatalog(rows(await execute('models.catalog', { category })))
    } catch (e) {
      setError(describeError(e))
    } finally {
      setLoading(false)
    }
  }, [tab, category, execute, format, engineForModels])
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
                aria-label="Task"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value)
                  // Formats are chat models' only: another task lists its own catalog.
                  setFormat('gguf')
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
            {category === 'text' && catalogFormats(registered).length > 1 && (
              <Field label="Format">
                <select
                  aria-label="Format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as CatalogFormat)}
                >
                  {catalogFormats(registered).map((f) => (
                    <option key={f} value={f}>
                      {
                        {
                          gguf: 'GGUF',
                          safetensors: 'Safetensors (managed engines)',
                          foundry: 'Foundry Local',
                          litert: 'LiteRT-LM',
                        }[f]
                      }
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {format === 'safetensors' && managedEngines.length > 1 && (
              <Field label="Engine">
                <select
                  aria-label="Engine"
                  value={engineForModels}
                  onChange={(e) => setManagedEngine(e.target.value)}
                >
                  {managedEngines.map((e) => (
                    <option key={e}>{e}</option>
                  ))}
                </select>
              </Field>
            )}
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
                onClick={async () =>
                  setCatalog(
                    format === 'gguf'
                      ? rows(await execute('models.search', { query }))
                      : catalogCards(
                          await execute('models.search', {
                            engine: FORMAT_ENGINE[format] ?? engineForModels,
                            query,
                          }),
                          format
                        )
                  )
                }
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
          onChanged={refresh}
        />
      )}
      {tab === 'engines' && (
        <EnginesTab
          engines={engines}
          loading={loading}
          execute={execute}
          onManaged={setManaged}
          onAccelerators={setAccelerators}
          onSettings={setSettingsProvider}
        />
      )}
      {tab === 'downloads' && <Downloads workspace={w} />}
      {accelerators === 'foundry-local' && <FoundryLocal workspace={w} onClose={() => setAccelerators('')} />}
      {accelerators === 'litert-lm' && <LiteRtLm workspace={w} onClose={() => setAccelerators('')} />}
      {managed && <EngineSetup workspace={w} engine={managed} onClose={() => setManaged('')} />}
      {settingsProvider && (
        <EngineSettings provider={settingsProvider} workspace={w} onClose={() => setSettingsProvider('')} />
      )}
      {selected && format === 'safetensors' && category === 'text' && (
        <ManagedModelInstall
          workspace={w}
          repository={text(selected.id)}
          onClose={() => setSelected(null)}
          onStarted={() => setTab('downloads')}
          onInstallEngine={(engine) => {
            setSelected(null)
            setManaged(engine)
          }}
        />
      )}
      {selected && format === 'foundry' && category === 'text' && (
        <FoundryModelInstall
          workspace={w}
          model={selected.foundry as never}
          onClose={() => setSelected(null)}
          onStarted={() => setTab('downloads')}
          onFoundry={() => {
            setSelected(null)
            setAccelerators('foundry-local')
          }}
        />
      )}
      {selected && format === 'litert' && category === 'text' && (
        <LiteRtModelInstall
          workspace={w}
          model={selected.litert as never}
          onClose={() => setSelected(null)}
          onStarted={() => setTab('downloads')}
          onEngine={() => (setSelected(null), setAccelerators('litert-lm'))}
        />
      )}
      {managedRepo && (
        <ManagedModelInstall
          workspace={w}
          repository={managedRepo}
          onClose={() => setManagedRepo('')}
          onStarted={() => setTab('downloads')}
          onInstallEngine={(engine) => {
            setManagedRepo('')
            setManaged(engine)
          }}
        />
      )}
      {selected && (format === 'gguf' || category !== 'text') && (
        <ModelInstall
          onNoGguf={
            catalogFormats(registered).includes('safetensors')
              ? (repo) => {
                  setSelected(null)
                  setManagedRepo(repo)
                }
              : undefined
          }
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
