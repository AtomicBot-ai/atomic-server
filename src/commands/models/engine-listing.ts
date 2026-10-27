/**
 * `atc models catalog|search --engine <engine>`: where each engine's list comes from. LiteRT-LM and
 * Foundry Local have lists of their own, a managed engine reads its descriptor, and every other engine
 * (MLX, the llama.cpp family) narrows the catalog to what it runs — the same rule as the Local models
 * filter of the web admin and the terminal UI.
 */

import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type { EngineId } from '@atomic-chat/core/contracts'
import { AtcError } from '../../cli/index.js'
import type { CommandContext } from '../../cli/index.js'
import { matchesEngineFilter, modelEngines } from '../../workspace-view/index.js'
import { printOperation, workspace } from '../server/control.js'

export type ListingRoute = 'all' | 'litert' | 'foundry' | 'managed' | 'local'

export function listingRoute(engine: string | undefined): ListingRoute {
  if (engine === undefined) return 'all'
  if (engine === 'litert-lm') return 'litert'
  if (engine === 'foundry-local') return 'foundry'
  const kind = ENGINE_KINDS[engine as EngineId]
  if (!kind)
    throw new AtcError('ATC_USAGE', `${engine} is not an engine.`, {
      hint: `one of ${Object.keys(ENGINE_KINDS).join(', ')}`,
    })
  return kind === 'managed' ? 'managed' : 'local'
}

export interface CatalogRow {
  id: string
  name: string
  description: string
  category: string
  source: Record<string, unknown>
}

/** The catalog rows `engine` runs, matching `query` in id, name or description. */
export function localRows(rows: readonly CatalogRow[], engine: string, query = ''): CatalogRow[] {
  const q = query.trim().toLowerCase()
  return rows.filter((row) => {
    const format = String(row.source['format'] ?? 'gguf'),
      own = row.source['engine'] ?? row.source['provider']
    if (!matchesEngineFilter(engine, modelEngines(own ? [String(own)] : [], format, row.id))) return false
    return !q || `${row.id} ${row.name} ${row.description}`.toLowerCase().includes(q)
  })
}

/** `atc models catalog|search --engine <local engine>`: the catalog, narrowed; the engine must be here. */
export async function localListing(ctx: CommandContext, engine: string, query = ''): Promise<number> {
  const service = await workspace(ctx)
  const { engines } = (await service.execute('engines.list')) as { engines: Array<{ engine: string }> }
  if (!engines.some((e) => e.engine === engine))
    throw new AtcError('ATC_USAGE', `${engine} is not available on this machine.`, {
      hint: `see atc engines list`,
    })
  const catalog = (await service.execute('models.catalog', { category: 'text' })) as { rows: CatalogRow[] }
  const rows = localRows(catalog.rows, engine, query)
  return printOperation(ctx, 'models.catalog', { ...catalog, rows, engine })
}
