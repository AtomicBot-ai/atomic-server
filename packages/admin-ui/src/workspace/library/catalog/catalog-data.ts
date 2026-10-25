import { record, rows, text } from '../../types'
import type { RecordValue } from '../../types'
import { catalogFormatsFor } from '@view'
import type { CatalogFormat } from '@view'

export type { CatalogFormat } from '@view'

/** The formats the chat catalog offers on this host: GGUF, plus what the core's engines here run. */
export function catalogFormats(engines: readonly RecordValue[]): CatalogFormat[] {
  return catalogFormatsFor(
    engines.map((e) => ({ engine: text(e.engine), kind: text(e.kind, '') || undefined }))
  )
}

/**
 * A managed engine's curated checkpoints or Hub search rows, or Foundry Local's or LiteRT-LM's models,
 * as catalog cards that keep their engine for the catalog's filters.
 */
export function catalogCards(result: unknown, format: CatalogFormat, engine = ''): RecordValue[] {
  if (format === 'gguf' || format === 'mlx') return rows(result)
  const r = record(result)
  if (format === 'litert')
    return rows(r.models).map((m) => ({
      id: m.model_id,
      title: m.name,
      summary: `${text(m.default_variant, 'no variant runs here')}${m.unverified ? ' · Hugging Face, not verified by Atomic Chat' : ''}${m.gated ? ' · gated' : ''}`,
      format: 'LiteRT-LM',
      providers: ['litert-lm'],
      litert: m,
    }))
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
