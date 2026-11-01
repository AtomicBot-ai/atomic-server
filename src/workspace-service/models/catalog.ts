import { join } from 'node:path'
import type { AtcPaths } from '../../config/index.js'
import { readDocument, writeDocument } from '../../terminal-data/index.js'
import { object } from '../validation.js'
import { fetchAudioCatalog } from '../audio/audio-catalog.js'
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
    /** `ATC_AUDIO_MODELS_URL`: another audio list, a `file://` included. */
    private audioUrl?: string
  ) {}
  /** The one catalog with a copy of its own: it works before conf serves it, and offline. */
  private async audio(query: string, refresh: boolean) {
    const { list, source, fetchedAt, error } = await fetchAudioCatalog({
      cachePath: join(this.paths.cacheDir, 'workspace-audio.json'),
      fetch: this.request,
      url: this.audioUrl,
      force: refresh,
    })
    return {
      rows: this.rows(list.models, 'audio', query),
      cached: source !== 'remote',
      updated_at: fetchedAt ?? 0,
      // Serving the bundled copy is not a failure anyone can act on.
      ...(error && source === 'cache' ? { error } : {}),
    }
  }
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
    if (category === 'audio') return this.audio(query, refresh)
    const file =
      category === 'text' ? 'staff-picks' : ['image', 'video'].includes(category) ? 'diffusion' : category
    const path = join(this.paths.cacheDir, `workspace-${file}.json`)
    let doc = await readDocument<{ at: number; data: Record<string, unknown> } | null>(path, null),
      error: string | undefined
    let cached = true
    if (refresh || !doc || Date.now() - doc.at > 3600000) {
      try {
        const response = await this.request(
          `https://raw.githubusercontent.com/AtomicBot-ai/atomic-chat-conf/main/models/${file}.json`,
          { signal: AbortSignal.timeout(12000), redirect: 'error' }
        )
        if (!response.ok) throw new Error(`Catalog returned HTTP ${response.status}.`)
        doc = { at: Date.now(), data: object(await response.json()) }
        await writeDocument(path, doc)
        cached = false
      } catch (failure) {
        if (!doc) throw failure
        error = failure instanceof Error ? failure.message : String(failure)
      }
    }
    const data = doc!.data
    const entries = (data['picks'] ?? data['families'] ?? data['models']) as Record<string, unknown>[]
    if (!Array.isArray(entries)) throw new Error('The model catalog has an invalid format.')
    const rows = this.rows(entries, category, query)
    return { rows, cached, updated_at: doc!.at, ...(error ? { error } : {}) }
  }
}
