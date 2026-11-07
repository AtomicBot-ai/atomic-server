import { afterEach, expect, it, vi } from 'vitest'
import { CATALOG_PREFERENCES_KEY, readCatalogSelection } from './catalog-preferences'
afterEach(() => vi.restoreAllMocks())
it.each(['{bad', 'null', JSON.stringify({ category: 7, format: {}, query: [], filters: null, sort: false })])(
  'defaults malformed catalog preferences: %s',
  (raw) => {
    localStorage.setItem(CATALOG_PREFERENCES_KEY, raw)
    expect(readCatalogSelection()).toEqual({
      category: 'text',
      format: 'gguf',
      query: '',
      sort: 'recommended',
      filters: { engine: '', liked: false, downloaded: false, uncensored: false },
    })
  }
)
it('uses explicit navigation ahead of saved preferences while preserving a normal reentry', () => {
  localStorage.setItem(
    CATALOG_PREFERENCES_KEY,
    JSON.stringify({
      category: 'audio',
      format: 'mlx',
      query: 'saved',
      filters: { engine: 'mlx', liked: true },
    })
  )
  expect(readCatalogSelection()).toMatchObject({
    category: 'audio',
    format: 'mlx',
    query: 'saved',
    filters: { engine: 'mlx', liked: true },
  })
  expect(readCatalogSelection('fastflowlm')).toMatchObject({
    category: 'text',
    format: 'fastflowlm',
    query: '',
    filters: { engine: 'fastflowlm', liked: false },
  })
  expect(readCatalogSelection(undefined, 'image')).toMatchObject({
    category: 'image',
    format: 'mlx',
    query: '',
  })
})
it('works when browser storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  expect(readCatalogSelection().format).toBe('gguf')
})
