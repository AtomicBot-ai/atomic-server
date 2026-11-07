import { useCallback, useEffect, useRef, useState } from 'react'
import { FORMAT_ENGINE } from '@view'
import { describeError } from '@/services/admin-api'
import { watchSharedRead } from '../../watch-shared-read'
import { rows, text } from '../../types'
import type { Execute, RecordValue } from '../../types'
import type { CatalogSelection } from './catalog-preferences'
import { catalogCards } from './catalog-data'
import { modelId, modelProviders } from './catalog-models'
import { readInstalledModels } from './installed-model-read'

async function readCatalog(
  execute: Execute,
  category: string,
  format: CatalogSelection['format'],
  query: string,
  engines: string[]
) {
  if (category !== 'text' || (!query.trim() && ['gguf', 'mlx'].includes(format)))
    return rows(await execute('models.catalog', { category, ...(query.trim() ? { query } : {}) }))
  if (format === 'safetensors') {
    const results = await Promise.all(
      engines.map(async (engine) =>
        catalogCards(
          await execute(query.trim() ? 'models.search' : 'models.catalog', {
            engine,
            ...(query.trim() ? { query } : {}),
          }),
          format,
          engine
        )
      )
    )
    const merged = new Map<string, RecordValue>()
    for (const model of results.flat()) {
      const previous = merged.get(modelId(model))
      merged.set(
        modelId(model),
        previous
          ? { ...previous, providers: [...new Set([...modelProviders(previous), ...modelProviders(model)])] }
          : model
      )
    }
    return [...merged.values()]
  }
  return catalogCards(
    await execute('models.search', {
      ...(FORMAT_ENGINE[format]
        ? { engine: FORMAT_ENGINE[format] }
        : format === 'mlx'
          ? { engine: 'mlx' }
          : {}),
      query,
    }),
    format
  )
}

export function useCatalogResults(
  execute: Execute,
  tab: string,
  selection: CatalogSelection,
  registered: RecordValue[],
  revision: number
) {
  const {
    category,
    format,
    query,
    filters: { engine },
  } = selection
  const managed = registered
    .filter((e) => e.kind === 'managed' && (!engine || e.engine === engine))
    .map((e) => text(e.engine))
    .join('|')
  const [catalog, setCatalog] = useState<RecordValue[]>([])
  const [installed, setInstalled] = useState<RecordValue[]>([])
  const [engines, setEngines] = useState<RecordValue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancelPending = useCallback(() => {
    clearTimeout(timer.current)
    requestId.current++
  }, [])
  const invalidate = useCallback(() => {
    cancelPending()
    setCatalog([])
    setError('')
  }, [cancelPending])
  const refresh = useCallback(
    async (background = false, afterChange = false) => {
      clearTimeout(timer.current)
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
          const { chat, media } = await readInstalledModels(execute, afterChange)
          result = [...rows(chat), ...rows(media).filter((model) => model.stage === 'ready')]
          commit = setInstalled
        } else if (tab === 'catalog')
          result = await readCatalog(execute, category, format, query, managed ? managed.split('|') : [])
        if (request === requestId.current) commit(result)
      } catch (e) {
        if (request === requestId.current) setError(describeError(e))
      } finally {
        if (request === requestId.current) setLoading(false)
      }
    },
    [execute, tab, category, format, query, managed]
  )
  useEffect(() => {
    invalidate()
    setLoading(true)
    const stop = ['installed', 'engines'].includes(tab)
      ? watchSharedRead(
          () => refresh(true),
          () => {},
          () => {}
        )
      : undefined
    if (!stop) {
      if (tab === 'catalog' && query.trim()) {
        setLoading(true)
        timer.current = setTimeout(() => void refresh(), 350)
      } else void refresh()
    }
    return () => {
      stop?.()
      cancelPending()
    }
  }, [refresh, invalidate, cancelPending, tab, query, engine, revision])
  return { catalog, installed, engines, loading, error, invalidate, refresh }
}
