/** Shape engine-owned model catalogs for guided setup without discarding device choices. */
import type { WorkspaceController } from '../controller.js'
import type { EngineSetupPath, EngineSetupRow } from '../../../terminal-setup/index.js'
import { formatSize, variantLabel, liteRtVariantLabel } from '../../../workspace-view/index.js'

export async function engineSetupRows(
  c: WorkspaceController,
  path: EngineSetupPath,
  query: string
): Promise<EngineSetupRow[]> {
  if (
    path.kind === 'foundry' ||
    path.kind === 'litert' ||
    path.kind === 'geniex' ||
    path.kind === 'fastflowlm'
  ) {
    const found = (await c.runtime.execute('models.search', { engine: path.engine, query })) as {
      models: Array<{
        model_id: string
        name: string
        default_variant: string | null
        unverified: boolean
        recommended?: boolean
        variants?: Array<{
          id: string
          execution_provider?: string
          device?: string
          backend?: string
          npu?: string
        }>
      }>
    }
    return found.models.map((m) => ({
      id: m.model_id,
      title: m.name,
      detail:
        path.kind === 'foundry' || path.kind === 'litert'
          ? [
              ...new Set(
                (m.variants ?? []).map((v) =>
                  path.kind === 'litert'
                    ? liteRtVariantLabel({ backend: v.backend ?? '', npu: v.npu })
                    : variantLabel({ execution_provider: v.execution_provider ?? '', device: v.device ?? '' })
                )
              ),
            ]
              .filter(Boolean)
              .join(' · ') || 'Choose a device variant'
          : `${m.default_variant ?? 'Choose a variant'}${m.unverified ? ' · unverified' : ''}`,
      installedIds: m.variants?.map((v) => v.id) ?? [],
      ...(m.recommended === undefined ? {} : { recommended: m.recommended }),
    }))
  }
  if (query) {
    const found = (await c.runtime.execute('models.search', { engine: path.engine, query })) as {
      rows: Array<{ repository: string; section: string; weight_bytes_estimate: number | null }>
    }
    return found.rows.map((r) => ({
      id: r.repository,
      title: r.repository,
      detail: r.weight_bytes_estimate ? `about ${formatSize(r.weight_bytes_estimate)}` : r.section,
    }))
  }
  const curated = (await c.runtime.execute('models.catalog', { engine: path.engine })) as {
    models: Array<{ repository: string; note: string; vram_tier_bytes: number }>
  }
  return curated.models.map((m) => ({
    id: m.repository,
    title: m.repository,
    detail: `${m.note}${m.vram_tier_bytes ? ` · ${formatSize(m.vram_tier_bytes)} GPU` : ''}`,
  }))
}
