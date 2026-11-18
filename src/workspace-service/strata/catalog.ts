import { projectStrataCollection } from '@atomic-chat/core/client'
import type { StrataCheckResult } from '@atomic-chat/core/contracts'
import type { WorkspaceServiceOptions } from '../service-options.js'
import { unifiedCatalog } from '../models/unified-catalog.js'

export async function strataCatalog(options: WorkspaceServiceOptions, query: string, refresh: boolean) {
  const result = await unifiedCatalog(
    options.paths.cacheDir,
    options.fetch ?? fetch,
    refresh,
    options.env?.['ATC_MODEL_CATALOG_URL']
  )
  const search = query.trim().toLowerCase()
  const entries = projectStrataCollection(result.catalog).models.filter((descriptor) =>
    `${descriptor.name} ${descriptor.family} ${descriptor.variant_id}`.toLowerCase().includes(search)
  )
  const rows = await Promise.all(
    entries.map(async (descriptor) => {
      const check = await options.link.request<StrataCheckResult>('POST', '/models/strata/check', {
        descriptor,
      })
      return {
        id: descriptor.variant_id,
        name: descriptor.name,
        category: 'text' as const,
        description: check.reason ?? '',
        source: { provider: 'strata', format: 'strata', descriptor, check },
      }
    })
  )
  return {
    rows,
    models: rows.map(({ id, name, source: { descriptor, check } }) => {
      const capabilities = check.capabilities ?? descriptor.capabilities
      return {
        model_id: id,
        name,
        default_variant: id,
        license: descriptor.license,
        gated: descriptor.gated,
        context_length: descriptor.context_length,
        ...capabilities,
        variants: [
          {
            id,
            size_bytes: descriptor.requirements.download_bytes,
            summary: check.reason ?? '',
            context_length: descriptor.context_length,
            ...capabilities,
            verdict: check,
          },
        ],
      }
    }),
    cached: result.source !== 'remote',
    updated_at: result.fetchedAt ?? 0,
    ...(result.error ? { error: result.error } : {}),
  }
}
