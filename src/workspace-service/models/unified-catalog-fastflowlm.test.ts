import { expect, it, vi } from 'vitest'
import { parseFastFlowLmDescriptor, projectFastFlowLmCollection } from '@atomic-chat/core/client'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { unifiedCatalog, unifiedCatalogBaseline } from './unified-catalog.js'

it('offers the pinned FLM catalog and ten recommendations on a cold offline start', async () => {
  const { paths, cleanup } = tmpDataFolder()
  const request = vi.fn(async () => {
    throw new Error('offline')
  })
  try {
    const result = await unifiedCatalog(paths.cacheDir, request)
    expect(result.source).toBe('baseline')
    expect(result.error).toContain('offline')
    const { models } = projectFastFlowLmCollection(result.catalog)
    expect(models).toHaveLength(44)
    expect(models.filter((model) => model.recommended)).toHaveLength(10)
    expect(models.find((model) => model.model_id === 'qwen3-0.6b')).toMatchObject({
      recommended: true,
      qualification: { status: 'qualified' },
    })
    for (const model of models) expect(() => parseFastFlowLmDescriptor(model)).not.toThrow()
    expect(request).toHaveBeenCalledTimes(1)
  } finally {
    cleanup()
  }
})

it('keeps an available catalog without FLM authoritative over the bundled fallback', async () => {
  const { paths, cleanup } = tmpDataFolder()
  const catalog = structuredClone(unifiedCatalogBaseline())
  delete catalog.collections['fastflowlm-models']
  try {
    const result = await unifiedCatalog(paths.cacheDir, async () => Response.json(catalog))
    expect(result.source).toBe('remote')
    expect(projectFastFlowLmCollection(result.catalog).models).toEqual([])
  } finally {
    cleanup()
  }
})
