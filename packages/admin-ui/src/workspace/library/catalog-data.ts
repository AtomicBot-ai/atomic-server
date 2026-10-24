import { record, rows, text } from '../types'
import type { RecordValue } from '../types'

export type CatalogFormat = 'gguf' | 'mlx' | 'safetensors' | 'foundry'

/** The formats the chat catalog offers on this host: GGUF, plus what the core's engines here run. */
export function catalogFormats(engines: readonly RecordValue[]): CatalogFormat[] {
  return [
    'gguf',
    ...(engines.some((e) => e.engine === 'mlx') ? (['mlx'] as const) : []),
    ...(engines.some((e) => e.kind === 'managed') ? (['safetensors'] as const) : []),
    ...(engines.some((e) => e.engine === 'foundry-local') ? (['foundry'] as const) : []),
  ]
}

/** Keep engine identity when normalizing curated checkpoints and search results for catalog filters. */
export function catalogCards(result: unknown, format: CatalogFormat, engine = ''): RecordValue[] {
  if (format === 'gguf' || format === 'mlx') return rows(result)
  const r = record(result)
  if (format === 'foundry')
    return rows(r.models).map((m) => ({
      id: m.model_id,
      title: m.name,
      summary: `${text(m.default_variant, 'no variant runs here')}${m.unverified ? ' · unverified' : ''}`,
      format: 'Foundry Local',
      providers: ['foundry-local'],
      foundry: m,
    }))
  const list = Array.isArray(r.models) ? rows(r.models) : rows(r.rows)
  return list.map((m) => ({
    id: m.repository,
    title: m.repository,
    summary: text(m.note ?? m.section, ''),
    format: 'safetensors',
    providers: engine ? [engine] : [],
  }))
}
