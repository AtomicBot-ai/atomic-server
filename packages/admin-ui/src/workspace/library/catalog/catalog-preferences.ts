import { useEffect, useState } from 'react'
import { CATALOG_FORMAT_LABELS, engineCatalogFormat } from '@view'
import type { CatalogFormat } from './catalog-data'
import { initialCatalogFilters } from './catalog-models'
import type { CatalogFilters } from './catalog-models'
import { record } from '../../types'

export const CATALOG_PREFERENCES_KEY = 'atomic-server-catalog'
export interface CatalogSelection {
  category: string
  format: CatalogFormat
  query: string
  filters: CatalogFilters
  sort: string
}
export function readCatalogSelection(engine?: string, category?: string): CatalogSelection {
  let saved: Record<string, unknown> = {}
  try {
    saved = record(JSON.parse(localStorage.getItem(CATALOG_PREFERENCES_KEY) ?? '{}'))
  } catch {
    /* Storage is optional. */
  }
  const f = record(saved.filters)
  const savedEngine =
    typeof f.engine === 'string' && !['audio-cpp', 'sd-cpp'].includes(f.engine) ? f.engine : ''
  const format = Object.hasOwn(CATALOG_FORMAT_LABELS, String(saved.format))
    ? (saved.format as CatalogFormat)
    : 'gguf'
  return {
    category:
      category ??
      (engine
        ? 'text'
        : ['text', 'image', 'video', 'audio', 'embedding', 'decision'].includes(String(saved.category))
          ? String(saved.category)
          : 'text'),
    format: engine ? engineCatalogFormat(engine) : savedEngine ? engineCatalogFormat(savedEngine) : format,
    query: engine || category ? '' : typeof saved.query === 'string' ? saved.query : '',
    filters: engine
      ? { ...initialCatalogFilters, engine }
      : {
          engine: savedEngine,
          liked: f.liked === true,
          downloaded: f.downloaded === true,
          uncensored: f.uncensored === true,
        },
    sort:
      typeof saved.sort === 'string' &&
      ['recommended', 'downloads', 'last-modified', 'likes'].includes(saved.sort)
        ? saved.sort
        : 'recommended',
  }
}
export function useCatalogSelection(engine?: string, category?: string) {
  const [selection, setSelection] = useState(() => readCatalogSelection(engine, category))
  useEffect(() => {
    try {
      localStorage.setItem(CATALOG_PREFERENCES_KEY, JSON.stringify(selection))
    } catch {
      /* Storage is optional. */
    }
  }, [selection])
  return [selection, setSelection] as const
}
