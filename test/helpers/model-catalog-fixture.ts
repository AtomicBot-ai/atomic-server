/** Construct complete canonical documents for tests which vary one collection. */
import baseline from '../../src/workspace-service/models/model-catalog-baseline.json' with { type: 'json' }
import { parseAtomicModelCatalog } from '@atomic-chat/core/client'
import type { AtomicModelCatalog } from '@atomic-chat/core/client'
export const MODEL_COMMIT = 'a'.repeat(40)
export function catalogFixture(documents: Record<string, Record<string, unknown>> = {}): AtomicModelCatalog {
  const catalog = structuredClone(baseline) as AtomicModelCatalog
  const fields: Record<string, string> = {
    'staff-picks': 'picks',
    'diffusion': 'families',
    'embedding': 'models',
    'decision': 'models',
  }
  for (const [name, document] of Object.entries(documents)) {
    const field = fields[name]!
    const rows = document[field] as Record<string, unknown>[]
    const pin = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(pin)
      if (!value || typeof value !== 'object') return
      const row = value as Record<string, unknown>
      if (typeof row['repo'] === 'string' || typeof row['model_name'] === 'string') {
        if (typeof row['revision'] !== 'string' || !/^[0-9a-f]{40}$/.test(row['revision']))
          row['revision'] = MODEL_COMMIT
      }
      Object.values(row).forEach(pin)
    }
    const entries = rows.map((raw) => {
      const definition = structuredClone(raw)
      pin(definition)
      const id = `fixture:${name}:${String(definition['id'] ?? definition['model_name'])}`
      catalog.models[id] = {
        kind: name === 'staff-picks' ? 'chat' : name,
        format: String(definition['format'] ?? 'gguf'),
        variants: { default: {} },
        files: [{ path: 'model.gguf', size: 1 }],
        definition,
      }
      return { model: id, variant: 'default' }
    })
    const { [field]: _rows, ...header } = document
    catalog.collections[name] = {
      header: { schema_version: 1, updated_at: '2026-11-01T00:00:00Z', ...header },
      entries,
    }
  }
  return parseAtomicModelCatalog(catalog)
}
