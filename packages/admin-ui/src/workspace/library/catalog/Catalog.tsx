import { CloudProviders } from '../cloud/CloudProviders'
import { useEffect, useRef, useState } from 'react'
import { useCatalogSelection } from './catalog-preferences'
import { useCatalogResults } from './useCatalogResults'
import { LIBRARY_SECTIONS } from '@contract'
import type { Workspace } from '../../useWorkspace'
import { Action } from '../../Controls'
import { CatalogBrowse } from './CatalogBrowse'
import { text } from '../../types'
import type { RecordValue } from '../../types'
import { ModelInstall } from '../install/ModelInstall'
import { Downloads } from '../downloads/Downloads'
import { EngineSettings } from '../engines/EngineSettings'
import { EnginesTab } from '../engines/EnginesTab'
import { catalogFormats } from './catalog-data'
import { useEngines } from '../../useEngines'
import { InstalledModels } from './InstalledModels'
import { ImportModel } from '../install/ImportModel'

export function Catalog({
  workspace: w,
  openCommand,
  section,
  onSection,
  engine,
  initialCategory,
}: {
  workspace: Workspace
  openCommand: (name: string) => void
  section?: string
  onSection?: (section: string) => void
  /** Opened from Server → Browse models: the engine's format and filter, as the Filters menu sets them. */
  engine?: string
  initialCategory?: string
}) {
  const [localTab, setLocalTab] = useState('catalog')
  const tab = section ?? localTab
  const selectTab = onSection ?? setLocalTab
  const [selection, setSelection] = useCatalogSelection(engine, initialCategory)
  const { category, format, query } = selection
  const [selected, setSelected] = useState<RecordValue | null>(null)
  const [settingsProvider, setSettingsProvider] = useState('')
  const previousProvider = useRef('')
  useEffect(() => {
    if (!settingsProvider && previousProvider.current)
      document.getElementById(`engine-directory-${previousProvider.current}`)?.focus()
    previousProvider.current = settingsProvider
  }, [settingsProvider])
  const [importing, setImporting] = useState(false)
  const [importNotice, setImportNotice] = useState('')
  const [importRevision, setImportRevision] = useState(0)
  const [managedRepo, setManagedRepo] = useState('')
  const { engines: registered } = useEngines(w.execute)
  const { execute } = w
  const {
    catalog,
    installed,
    engines,
    loading,
    error,
    invalidate: invalidateResults,
    refresh,
  } = useCatalogResults(execute, tab, selection, registered, importRevision)
  const invalidate = () => {
    invalidateResults()
    setSelected(null)
    setManagedRepo('')
  }
  const setTab = (value: string) => {
    if (value !== tab) {
      invalidate()
      selectTab(value)
    }
  }
  const refreshResults = () => void refresh()
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
            setSelection((s) => ({
              ...s,
              category: 'text',
              format: 'gguf',
              query: '',
              filters: { ...s.filters, engine: '' },
            }))
            setImportRevision((value) => value + 1)
          }}
        />
      )}
      {tab !== 'catalog' && tab !== 'endpoint' && (
        <div className="page-heading">
          <h1>{LIBRARY_SECTIONS.find((s) => s.id === tab)?.label ?? 'Models'}</h1>
          {tab !== 'engines' && <Action onClick={refresh}>Refresh</Action>}
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
          {tab === 'engines' && <Action onClick={refresh}>Retry</Action>}
        </p>
      )}
      {tab === 'catalog' && (
        <>
          <Downloads workspace={w} compact showTitle={false} />
          <CatalogBrowse
            key={importRevision}
            filters={selection.filters}
            onFilters={(filters) => {
              if (filters.engine !== selection.filters.engine) invalidate()
              setSelection((s) => ({ ...s, filters }))
            }}
            sort={selection.sort}
            onSort={(sort) => setSelection((s) => ({ ...s, sort }))}
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
            loading={loading}
            execute={execute}
            setCategory={(value) => {
              if (value === category) return
              invalidate()
              setSelection((s) => ({ ...s, category: value, query: '' }))
            }}
            setFormat={(value) => {
              if (value === format) return
              invalidate()
              setSelection((s) => ({ ...s, format: value }))
            }}
            setQuery={(value) => {
              invalidate()
              setSelection((s) => ({ ...s, query: value }))
            }}
            choose={setSelected}
            importFile={() => {
              setImportNotice('')
              setImporting(true)
            }}
            onNoGguf={catalogFormats(registered).includes('safetensors') ? setManagedRepo : undefined}
            search={refreshResults}
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
          onChanged={() => refresh(false, true)}
        />
      )}
      {tab === 'engines' && (!error || engines.length > 0) && (
        <EnginesTab
          engines={engines}
          snapshot={w.snapshot}
          loading={loading}
          onSettings={setSettingsProvider}
        />
      )}
      {tab === 'downloads' && <Downloads workspace={w} showTitle={false} />}
      {settingsProvider && (
        <EngineSettings
          presentation="drawer"
          provider={settingsProvider}
          workspace={w}
          onClose={() => setSettingsProvider('')}
        />
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
