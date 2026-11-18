import type { StrataMaintenance, StrataPreparationOperation } from '@atomic-chat/core/contracts'
import { StrataRegistry } from '@atomic-chat/core/models'
import type { WorkspaceServiceOptions } from '../service-options.js'

export async function installedStrata({ link, paths }: WorkspaceServiceOptions) {
  const entries = await new StrataRegistry(paths.layout).list()
  if (!entries.length) return []
  const [preparations, maintenance] = await Promise.all([
    link.request<StrataPreparationOperation[]>('GET', '/strata/preparations'),
    link.request<StrataMaintenance[]>('GET', '/models/strata/maintenance'),
  ])
  return entries.map(({ id, yml, strata }) => {
    const latest = preparations.findLast(
      (op) => op.model_id === id && op.source_digest === strata.source_digest
    )
    const held = maintenance.some((op) => op.model_id === id && op.state !== 'completed')
    const status = held
      ? 'Under maintenance'
      : latest?.state === 'ready'
        ? null
        : latest && ['queued', 'preparing', 'verifying'].includes(latest.state)
          ? 'Preparing model'
          : 'Preparation required'
    return {
      id,
      name: String(yml.name ?? id),
      provider: 'strata',
      store: 'strata',
      size_bytes: yml.size_bytes,
      disabled_reason: status,
    }
  })
}
