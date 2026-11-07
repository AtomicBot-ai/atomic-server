import { expect, it, vi } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { unifiedCatalog, unifiedCatalogBaseline } from './unified-catalog.js'
it('does not substitute another source cache for an explicit local catalog', async () => {
  const { paths, cleanup } = tmpDataFolder()
  try {
    const first = unifiedCatalogBaseline()
    const request = vi.fn(async () => Response.json(first))
    await unifiedCatalog(paths.cacheDir, request)
    const path = join(paths.atcDir, 'override.json')
    const local = { ...first, updated_at: '2026-11-06T00:00:00Z' }
    await writeFile(path, JSON.stringify(local))
    const result = await unifiedCatalog(paths.cacheDir, request, false, pathToFileURL(path).href)
    expect(result.catalog.updated_at).toBe(local.updated_at)
    expect(result.source).toBe('remote')
    expect(request).toHaveBeenCalledTimes(1)
  } finally {
    cleanup()
  }
})
