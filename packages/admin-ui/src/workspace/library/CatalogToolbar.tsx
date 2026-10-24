// Lifted from Atomic-Chat/web-app/src/containers/hub/HubSearchToolbar.tsx + HubFilters.tsx @ 5043013; adapted to live workspace catalogs.
import { useRef } from 'react'
import { useCatalogMenu } from './useCatalogMenu'
import { CatalogCategory } from './CatalogCategory'
import { SlidersHorizontal, ArrowDownUp, Upload, Search, LoaderCircle } from 'lucide-react'
import { engineName } from '@view'
import type { RecordValue } from '../types'
import { text } from '../types'
import { catalogFormats } from './catalog-data'
import type { CatalogFormat } from './catalog-data'
import { initialCatalogFilters } from './catalog-models'
import type { CatalogFilters } from './catalog-models'
export function CatalogToolbar({
  category,
  setCategory,
  format,
  setFormat,
  query,
  setQuery,
  search,
  engines,
  filters,
  setFilters,
  sort,
  setSort,
  importFile,
  hasLikes,
  busy = false,
}: {
  category: string
  setCategory: (value: string) => void
  format: CatalogFormat
  setFormat: (value: CatalogFormat) => void
  query: string
  setQuery: (value: string) => void
  search: () => void
  engines: RecordValue[]
  filters: CatalogFilters
  setFilters: (value: CatalogFilters) => void
  sort: string
  setSort: (value: string) => void
  importFile: () => void
  hasLikes: boolean
  busy?: boolean
}) {
  const searchInput = useRef<HTMLInputElement>(null)
  const { menu, setMenu, closeMenu, ref, onKeyDown } = useCatalogMenu()
  const count = Object.values(filters).filter(Boolean).length
  return (
    <div
      className="hub-toolbar"
      ref={ref}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) closeMenu()
      }}
    >
      <CatalogCategory
        value={category}
        onFocus={() => setMenu('')}
        onChange={(value) => {
          setCategory(value)
          setMenu('')
        }}
      />
      <form
        className="hub-search"
        onSubmit={(e) => {
          e.preventDefault()
          search()
        }}
      >
        {busy ? (
          <LoaderCircle size={14} className="hub-search-busy" aria-hidden="true" />
        ) : (
          <Search size={14} aria-hidden="true" />
        )}
        <input
          ref={searchInput}
          aria-label="Search for models"
          placeholder="Search for models"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            aria-label="Clear search"
            type="button"
            onClick={() => {
              setQuery('')
              searchInput.current?.focus()
            }}
          >
            ×
          </button>
        )}
      </form>
      {category === 'text' && (
        <div
          className="hub-menu-anchor"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) closeMenu()
          }}
        >
          <button
            className="ew-button"
            data-menu-trigger="filters"
            aria-expanded={menu === 'filters'}
            aria-controls={menu === 'filters' ? 'catalog-filters' : undefined}
            onClick={() => setMenu(menu === 'filters' ? '' : 'filters')}
          >
            <SlidersHorizontal size={15} aria-hidden="true" /> Filters{count ? ` ${count}` : ''}
          </button>
          {menu === 'filters' && (
            <div id="catalog-filters" className="hub-menu" aria-label="Filter models">
              {category === 'text' && (
                <>
                  <fieldset>
                    <legend>Engine</legend>
                    {[
                      { engine: '', label: 'All engines' },
                      ...engines.map((e) => ({ engine: text(e.engine), label: engineName(text(e.engine)) })),
                    ].map((e) => (
                      <label key={e.engine}>
                        <input
                          type="radio"
                          name="catalog-engine"
                          checked={filters.engine === e.engine}
                          onChange={() => {
                            setFilters({ ...filters, engine: e.engine })
                            const selected = engines.find((v) => v.engine === e.engine)
                            if (e.engine)
                              setFormat(
                                e.engine === 'mlx'
                                  ? 'mlx'
                                  : e.engine === 'foundry-local'
                                    ? 'foundry'
                                    : selected?.kind === 'managed'
                                      ? 'safetensors'
                                      : 'gguf'
                              )
                          }}
                        />
                        {e.label}
                      </label>
                    ))}
                  </fieldset>
                  <fieldset>
                    <legend>Format</legend>
                    {catalogFormats(engines).map((f) => (
                      <label key={f}>
                        <input
                          type="radio"
                          name="catalog-format"
                          checked={format === f}
                          onChange={() => {
                            setFormat(f)
                            setFilters({ ...filters, engine: '' })
                          }}
                        />
                        {f === 'foundry'
                          ? 'Foundry Local'
                          : f === 'safetensors'
                            ? 'Safetensors'
                            : f.toUpperCase()}
                      </label>
                    ))}
                  </fieldset>
                </>
              )}
              <fieldset>
                <legend>Show only</legend>
                {(
                  [
                    ['liked', 'Liked models'],
                    ['uncensored', 'Uncensored'],
                    ['downloaded', 'Installed on this device'],
                  ] as const
                ).map(([id, label]) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked={filters[id]}
                      onChange={(e) => setFilters({ ...filters, [id]: e.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <button className="ew-button" onClick={() => setFilters(initialCatalogFilters)}>
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}
      {category === 'text' && (
        <div
          className="hub-menu-anchor"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) closeMenu()
          }}
        >
          <button
            className="ew-button"
            data-menu-trigger="sort"
            aria-expanded={menu === 'sort'}
            aria-controls={menu === 'sort' ? 'catalog-sort' : undefined}
            onClick={() => setMenu(menu === 'sort' ? '' : 'sort')}
          >
            <ArrowDownUp size={15} aria-hidden="true" /> Sort
          </button>
          {menu === 'sort' && (
            <div id="catalog-sort" className="hub-menu" aria-label="Sort models">
              <fieldset>
                <legend>Sort models</legend>
                {[
                  ['recommended', 'Recommended'],
                  ['downloads', 'Downloads'],
                  ['last-modified', 'Last updated'],
                  ...(hasLikes ? [['likes', 'Likes']] : []),
                ].map(([id, label]) => (
                  <label key={id}>
                    <input
                      type="radio"
                      name="catalog-sort"
                      checked={sort === id}
                      onChange={() => {
                        setSort(id)
                        closeMenu(true)
                      }}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
            </div>
          )}
        </div>
      )}
      <button className="ew-button hub-import" onClick={importFile}>
        <Upload size={15} aria-hidden="true" /> Import
      </button>
    </div>
  )
}
