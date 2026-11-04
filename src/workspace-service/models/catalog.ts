import { unifiedCollection } from './unified-catalog.js'
import type { AtcPaths } from '../../config/index.js'
import { parseAudioCatalog } from '../audio/audio-catalog.js'
export type CatalogCategory = 'text' | 'image' | 'video' | 'audio' | 'embedding' | 'decision'
export interface CatalogRow {
  id: string
  name: string
  category: CatalogCategory
  description: string
  source: Record<string, unknown>
}
export class WorkspaceCatalog {
  constructor(
    private paths: AtcPaths,
    private request: typeof fetch,
    private url?: string
  ) {}
  private rows(entries: Record<string, unknown>[], category: CatalogCategory, query: string): CatalogRow[] {
    const q = query.toLowerCase().trim()
    const rows = entries
      .filter(
        (r) => r['active'] !== false && (!['image', 'video'].includes(category) || r['modality'] === category)
      )
      .map((source) => ({
        id: String(source['model_name'] ?? source['id']),
        name: String(source['title'] ?? source['name'] ?? source['model_name'] ?? source['id']),
        description: String(source['summary'] ?? source['description'] ?? ''),
        category,
        source,
      }))
      .filter((r) => !q || `${r.id} ${r.name} ${r.description}`.toLowerCase().includes(q))
    if (q) rows.sort((a, b) => Number(/^AtomicChat\//i.test(b.id)) - Number(/^AtomicChat\//i.test(a.id)))
    return rows
  }
  async list(
    category: CatalogCategory = 'text',
    query = '',
    refresh = false
  ): Promise<{ rows: CatalogRow[]; cached: boolean; updated_at: number; error?: string }> {
    const file =
      category === 'text' ? 'staff-picks' : ['image', 'video'].includes(category) ? 'diffusion' : category
    const result = await unifiedCollection(file, this.paths.cacheDir, this.request, refresh, this.url)
    const data = result.value
    const cached = result.source !== 'remote'
    const error = result.error
    const entries =
      // Audio keeps only the entries this client can run on audio.cpp.
      category === 'audio'
        ? parseAudioCatalog(data).models
        : ((data['picks'] ?? data['families'] ?? data['models']) as Record<string, unknown>[])
    if (!Array.isArray(entries)) throw new Error('The model catalog has an invalid format.')
    const rows = this.rows(entries, category, query)
    return { rows, cached, updated_at: result.fetchedAt ?? 0, ...(error ? { error } : {}) }
  }
}
