import { watchSharedRead } from '../watch-shared-read'
import { CloudProviders } from './CloudProviders'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LIBRARY_SECTIONS } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { CatalogBrowse } from './CatalogBrowse'
import { rows, text } from '../types'
import type { RecordValue } from '../types'
import { describeError } from '@/services/admin-api'
import { ModelInstall } from './ModelInstall'
import { Downloads } from './Downloads'
import { EngineSettings } from './EngineSettings'
import { EngineSetup } from './EngineSetup'
import { EnginesTab } from './EnginesTab'
import { FoundryLocal } from './FoundryLocal'
import { catalogCards, catalogFormats } from './catalog-data'
import type { CatalogFormat } from './catalog-data'
import { useEngines } from '../useEngines'
import { InstalledModels } from './InstalledModels'
import { ImportModel } from './ImportModel'

export function Catalog({
  workspace: w,
  openCommand,
  section,
  onSection,
}: {
  workspace: Workspace
  openCommand: (name: string) => void
  section?: string
  onSection?: (section: string) => void
}) {
  const [localTab, setLocalTab] = useState('catalog')
  const tab = section ?? localTab
  const selectTab = onSection ?? setLocalTab
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
  const [foundry, setFoundry] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importNotice, setImportNotice] = useState('')
  const [importRevision, setImportRevision] = useState(0)
  const [format, setFormat] = useState<CatalogFormat>('gguf')
  const [managedRepo, setManagedRepo] = useState('')
  const [managedEngine, setManagedEngine] = useState('')
  const { engines: registered } = useEngines(w.execute)
  const managedEngines = registered.filter((e) => e.kind === 'managed').map((e) => text(e.engine))
  const engineForModels = managedEngines.includes(managedEngine) ? managedEngine : (managedEngines[0] ?? '')
  const { execute } = w
  const requestId = useRef(0)
  const invalidate = () => {
    requestId.current += 1
    setCatalog([])
    setSelected(null)
    setManagedRepo('')
    setError('')
  }
  const setTab = (value: string) => {
    if (value === tab) return
    invalidate()
    selectTab(value)
  }
  const refresh = useCallback(
    async (background = false) => {
      const request = ++requestId.current
      if (!background) setLoading(true)
      setError('')
      try {
        let result: RecordValue[] = [],
          commit = setCatalog
        if (tab === 'engines') {
          result = rows(await execute('engines.list'))
          commit = setEngines
        } else if (tab === 'installed') {
          const [chat, media] = await Promise.all([execute('models.installed'), execute('artifacts.list')])
          result = [...rows(chat), ...rows(media).filter((model) => model.stage === 'ready')]
          commit = setInstalled
        } else if (tab === 'catalog' && format === 'safetensors' && engineForModels)
          result = catalogCards(
            await execute('models.catalog', { engine: engineForModels }),
            format,
            engineForModels
          )
        else if (tab === 'catalog' && format === 'foundry')
          result = catalogCards(
            await execute('models.search', { engine: 'foundry-local', query: '' }),
            format
          )
        else if (tab === 'catalog') result = rows(await execute('models.catalog', { category }))
        if (request === requestId.current) commit(result)
      } catch (e) {
        if (request === requestId.current) setError(describeError(e))
      } finally {
        if (request === requestId.current) setLoading(false)
      }
    },
    [tab, category, execute, format, engineForModels]
  )
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const searchCatalog = useCallback(() => {
    clearTimeout(searchTimer.current)
    if (!query.trim() || category !== 'text') return
    const request = ++requestId.current
    setLoading(true)
    setError('')
    void execute(
      'models.search',
      format === 'gguf' || format === 'mlx'
        ? { query }
        : {
            engine: format === 'foundry' ? 'foundry-local' : engineForModels,
            query,
          }
    )
      .then((result) => {
        if (request === requestId.current) setCatalog(catalogCards(result, format, engineForModels))
      })
      .catch((e) => {
        if (request === requestId.current) setError(describeError(e))
      })
      .finally(() => {
        if (request === requestId.current) setLoading(false)
      })
  }, [query, category, execute, format, engineForModels])
  useEffect(() => {
    if (tab !== 'catalog' || category !== 'text' || !query.trim()) return
    searchTimer.current = setTimeout(searchCatalog, 350)
    return () => clearTimeout(searchTimer.current)
  }, [query, tab, category, searchCatalog])
  useEffect(() => {
    const stop = ['installed', 'engines'].includes(tab)
      ? watchSharedRead(
          () => refresh(true),
          () => {},
          () => {}
        )
      : undefined
    if (!stop) void refresh()
    return () => {
      stop?.()
      requestId.current += 1
    }
  }, [refresh, tab])
  const refreshResults = () => {
    if (category === 'text' && query.trim()) searchCatalog()
    else void refresh()
  }
  return (
    <div>
      {importNotice && tab === 'catalog' && <p role="status">{importNotice}</p>}
      {importing && (
        <ImportModel
          workspace={w}
          onClose={() => setImporting(false)}
          onImported={() => {
            invalidate()
            setImporting(false)
            setImportNotice('Model imported.')
            setCategory('text')
            setFormat('gguf')
            setQuery('')
            setImportRevision((value) => value + 1)
            if (category === 'text' && format === 'gguf') void refresh()
          }}
        />
      )}
      {tab !== 'catalog' && tab !== 'endpoint' && (
        <div className="page-heading">
          <h1>{LIBRARY_SECTIONS.find((s) => s.id === tab)?.label ?? 'Models'}</h1>
          <Action onClick={refresh}>Refresh</Action>
        </div>
      )}
      {!section && (
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
      )}
      {error && (
        <p className="ew-error" role="alert">
          {error}
        </p>
      )}
      {tab === 'catalog' && (
        <>
          <Downloads workspace={w} compact showTitle={false} />
          <CatalogBrowse
            key={importRevision}
            workspace={w}
            managedRepository={managedRepo}
            onStarted={() => {
              setManagedRepo('')
              refreshResults()
            }}
            catalog={catalog}
            category={category}
            format={format}
            query={query}
            engines={registered}
            onEngine={setManagedEngine}
            loading={loading}
            execute={execute}
            setCategory={(value) => {
              if (value === category) return
              invalidate()
              setCategory(value)
              setFormat('gguf')
              setQuery('')
            }}
            setFormat={(value) => {
              if (value === format) return
              invalidate()
              setFormat(value)
            }}
            setQuery={(value) => {
              setQuery(value)
              if (!value.trim() && query.trim()) void refresh()
            }}
            choose={setSelected}
            importFile={() => {
              setImportNotice('')
              setImporting(true)
            }}
            onNoGguf={catalogFormats(registered).includes('safetensors') ? setManagedRepo : undefined}
            search={searchCatalog}
          />
        </>
      )}
      {tab === 'cloud' && <CloudProviders workspace={w} />}
      {tab === 'endpoint' && <CloudProviders key="custom" workspace={w} custom />}
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
          onFoundry={() => setFoundry(true)}
          onSettings={setSettingsProvider}
        />
      )}
      {tab === 'downloads' && <Downloads workspace={w} showTitle={false} />}
      {foundry && <FoundryLocal workspace={w} onClose={() => setFoundry(false)} />}
      {managed && <EngineSetup workspace={w} engine={managed} onClose={() => setManaged('')} />}
      {settingsProvider && (
        <EngineSettings provider={settingsProvider} workspace={w} onClose={() => setSettingsProvider('')} />
      )}
      {selected && (['gguf', 'mlx'].includes(format) || category !== 'text') && (
        <ModelInstall
          autoStart
          initialFile={text(selected.selectedFile, '')}
          initialQuant={text(selected.selectedQuant, '')}
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
          onStarted={() => {
            setSelected(null)
            setManagedRepo('')
            refreshResults()
          }}
        />
      )}
    </div>
  )
}
