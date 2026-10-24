// Lifted from Atomic-Chat/web-app/src/containers/hub/ModelListRow.tsx @ 5043013; adapted: live server catalog and available metadata.
import { useEffect, useState } from 'react'
import type { RecordValue, Execute } from '../types'
import { record, text } from '../types'
import { Empty } from '../Controls'
import type { Workspace } from '../useWorkspace'
import { InstalledModels } from './InstalledModels'
import { CatalogMedia } from './CatalogMedia'
import { CatalogTable } from './CatalogTable'
import {
  installedModels,
  matchesCatalogModel,
  modelCategory,
  modelFormat,
  modelId,
  modelLikes,
  modelProviders,
} from './catalog-models'
import { CatalogModelOptions } from './CatalogModelOptions'
import { CatalogRuntimeOptions } from './CatalogRuntimeOptions'
import type { CatalogFormat } from './catalog-data'
import { CatalogToolbar } from './CatalogToolbar'
import { initialCatalogFilters } from './catalog-models'
import { catalogStatus } from './catalog-status'
import './catalog-desktop.css'
export function CatalogBrowse({
  catalog,
  category,
  setCategory,
  format,
  setFormat,
  query,
  setQuery,
  engines,
  loading,
  execute,
  search,
  choose,
  importFile,
  onNoGguf,
  workspace,
  managedRepository,
  onStarted,
  onEngine,
}: {
  managedRepository?: string
  onStarted?: () => void
  onEngine?: (engine: string) => void
  workspace?: Workspace
  catalog: RecordValue[]
  category: string
  setCategory: (value: string) => void
  format: CatalogFormat
  setFormat: (value: CatalogFormat) => void
  query: string
  setQuery: (value: string) => void
  engines: RecordValue[]
  loading: boolean
  execute: Execute
  search: () => void
  choose: (model: RecordValue) => void
  importFile: () => void
  onNoGguf?: (repository: string) => void
}) {
  const [textFilters, setFilters] = useState(initialCatalogFilters)
  const filters = category === 'text' ? textFilters : initialCatalogFilters
  const [sort, setSort] = useState('recommended')
  const [expanded, setExpanded] = useState('')
  const [liked, setLiked] = useState<string[]>(() => {
    try {
      return modelLikes(localStorage.getItem('atomic-server-model-likes'))
    } catch {
      return []
    }
  })
  const [revision, setRevision] = useState(0)
  const [installed, setInstalled] = useState<RecordValue[]>([])
  useEffect(() => {
    let live = true
    void Promise.all([execute('models.installed'), execute('artifacts.list')])
      .then(([chat, media]) => {
        if (live) setInstalled(installedModels(chat, media))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [execute, catalog, revision, workspace?.snapshot])
  const idOf = modelId
  const isInstalled = (id: string) => installed.some((m) => matchesCatalogModel(idOf(m), id))
  const deviceStatus = (model: RecordValue) =>
    catalogStatus(workspace?.snapshot, model, installed, category, filters.engine)
  const available = [
    ...catalog,
    ...installed.filter(
      (m) => !catalog.some((c) => matchesCatalogModel(idOf(m), idOf(c))) && modelCategory(m) === category
    ),
  ]
  const visible = available
    .filter((m) => {
      const id = idOf(m)
      const providers = modelProviders(m)
      const engines = providers.length
        ? providers
        : [modelFormat(m) === 'mlx' ? 'mlx' : /prism|bonsai/i.test(id) ? 'atomic-prism' : 'llamacpp-upstream']
      return (
        JSON.stringify(m).toLowerCase().includes(query.toLowerCase()) &&
        (!filters.engine ||
          engines.includes(filters.engine) ||
          (filters.engine === 'llamacpp' && engines.includes('llamacpp-upstream'))) &&
        (!filters.liked || liked.includes(id)) &&
        (!filters.downloaded || isInstalled(id)) &&
        (!filters.uncensored || /uncensored|abliterated/i.test(JSON.stringify(m))) &&
        (category !== 'text' || modelFormat(m) === format)
      )
    })
    .sort((a, b) => {
      if (sort === 'recommended') return 0
      const value = (m: RecordValue) => {
        const s = record(m.source)
        return sort === 'last-modified'
          ? Date.parse(text(m.last_modified ?? m.lastModified ?? s.last_modified ?? s.lastModified, '')) || 0
          : Number(m[sort] ?? s[sort] ?? 0)
      }
      return value(b) - value(a)
    })
  const detail = (model: RecordValue) => (
    <>
      {category === 'text' && Boolean(model.description ?? model.summary) && (
        <p>{text(model.description ?? model.summary)}</p>
      )}
      {isInstalled(idOf(model)) && workspace ? (
        <InstalledModels
          compact
          workspace={workspace}
          installed={installed.filter((m) => matchesCatalogModel(idOf(m), idOf(model)))}
          loading={false}
          browse={() => {}}
          openCommand={importFile}
          onChanged={() => setRevision((v) => v + 1)}
        />
      ) : isInstalled(idOf(model)) ? (
        <span>Downloaded</span>
      ) : workspace &&
        (['safetensors', 'foundry'].includes(modelFormat(model)) || managedRepository === idOf(model)) ? (
        <CatalogRuntimeOptions workspace={workspace} model={model} onStarted={onStarted} />
      ) : (
        <CatalogModelOptions {...{ model, category, execute, choose, onNoGguf }} />
      )}
    </>
  )
  return (
    <>
      <CatalogToolbar
        {...{
          category,
          setCategory,
          format,
          setFormat,
          query,
          setQuery,
          search,
          engines,
          filters,
          setFilters: (value) => {
            setFilters(value)
            onEngine?.(value.engine)
          },
          sort,
          setSort,
          importFile,
        }}
        busy={loading}
        hasLikes={catalog.some((m) => m.likes != null || record(m.source).likes != null)}
      />
      {loading ? (
        <Empty>Loading models…</Empty>
      ) : !visible.length ? (
        <Empty>No models match these filters.</Empty>
      ) : ['image', 'video', 'embedding', 'decision'].includes(category) ? (
        <CatalogMedia
          {...{
            models: visible,
            category,
            expanded,
            onExpand: setExpanded,
            isInstalled,
            deviceStatus,
            detail,
          }}
        />
      ) : (
        <CatalogTable
          models={visible}
          expanded={expanded}
          onExpand={setExpanded}
          liked={liked}
          isInstalled={isInstalled}
          deviceStatus={deviceStatus}
          onLike={(id) => {
            const next = liked.includes(id) ? liked.filter((v) => v !== id) : [...liked, id]
            setLiked(next)
            try {
              localStorage.setItem('atomic-server-model-likes', JSON.stringify(next))
            } catch {
              /* Storage can be unavailable. */
            }
          }}
          detail={detail}
        />
      )}
    </>
  )
}
