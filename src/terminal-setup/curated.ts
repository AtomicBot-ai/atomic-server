import { projectAtomicModelCollection } from '@atomic-chat/core/client'
import { unifiedCatalogBaseline, unifiedCollection } from '../workspace-service/index.js'
import { looksLikeHfRepo } from '@atomic-chat/core/models'
import { ATOMIC_MODEL_CATALOG_URL } from '@atomic-chat/core/client'
import type { HubRepository } from './types.js'
import { searchHub } from './catalog.js'
export const STAFF_PICKS_URL = ATOMIC_MODEL_CATALOG_URL
interface StaffPick {
  model_name: string
  title?: string
  summary?: string
  format?: string
  order?: number
  active?: boolean
  revision?: string
}
export function staffPicks(raw: unknown): HubRepository[] {
  const picks = (raw as { picks?: StaffPick[] } | null)?.picks
  if (!Array.isArray(picks)) throw new Error('Atomic Chat’s model catalog could not be read.')
  const rows = picks
    .filter(
      (p) =>
        p &&
        typeof p.model_name === 'string' &&
        looksLikeHfRepo(p.model_name) &&
        p.format !== 'mlx' &&
        p.active !== false
    )
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .map((p) => ({
      id: p.model_name,
      downloads: 0,
      ...(p.revision ? { revision: p.revision } : {}),
      ...(typeof p.title === 'string' ? { title: p.title } : {}),
      ...(typeof p.summary === 'string' ? { summary: p.summary } : {}),
    }))
  if (!rows.length) throw new Error('Atomic Chat’s model catalog is empty.')
  return rows
}
export function rankModels(rows: HubRepository[], query: string): HubRepository[] {
  const unique = rows.filter((r, i) => rows.findIndex((p) => p.id.toLowerCase() === r.id.toLowerCase()) === i)
  if (!query.trim()) return unique
  return unique.sort((a, b) => Number(/^AtomicChat\//i.test(b.id)) - Number(/^AtomicChat\//i.test(a.id)))
}
/** The desktop's staff-picks feed is the default; refresh never blocks browsing. */
export class ModelCatalog {
  private rows = staffPicks(projectAtomicModelCollection(unifiedCatalogBaseline(), 'staff-picks'))
  private refreshed = 0
  private refreshing: Promise<void> | undefined
  constructor(
    private directory: string,
    private request: typeof fetch,
    private url = process.env['ATC_MODEL_CATALOG_URL']
  ) {}
  revision(repository: string): string | undefined {
    return this.rows.find((row) => row.id === repository)?.revision
  }
  async list(query: string, signal: AbortSignal, onRefresh?: (rows: HubRepository[]) => void) {
    if (!query.trim()) {
      if (Date.now() - this.refreshed > 3600000 && !this.refreshing) {
        this.refreshing = this.refresh(signal)
          .then(() => {
            if (!signal.aborted) onRefresh?.(this.rows)
          })
          .catch(() => {})
          .finally(() => {
            this.refreshing = undefined
          })
      }
      return this.rows
    }
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
    const matches = this.rows.filter((r) => normalize(`${r.id} ${r.title ?? ''}`).includes(normalize(query)))
    return rankModels([...matches, ...(await searchHub(query, this.request, signal))], query)
  }
  private async refresh(signal: AbortSignal) {
    if (signal.aborted) return
    const result = await unifiedCollection('staff-picks', this.directory, this.request, true, this.url)
    this.rows = staffPicks(result.value)
    this.refreshed = Date.now()
  }
}
