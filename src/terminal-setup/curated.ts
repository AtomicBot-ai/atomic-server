import { join } from 'node:path'
import { readDocument, writeDocument } from '../terminal-data/index.js'
import baseline from './staff-picks.json' with { type: 'json' }
import type { HubRepository } from './types.js'
import { searchHub } from './catalog.js'
export const STAFF_PICKS_URL = baseline.source
interface StaffPick {
  model_name: string
  title?: string
  summary?: string
  format?: string
  order?: number
  active?: boolean
}
export function staffPicks(raw: unknown): HubRepository[] {
  const picks = (raw as { picks?: StaffPick[] } | null)?.picks
  if (!Array.isArray(picks)) throw new Error('Atomic Chat’s model catalog could not be read.')
  const rows = picks
    .filter(
      (p) =>
        p &&
        typeof p.model_name === 'string' &&
        /^[\w.-]+\/[\w.-]+$/.test(p.model_name) &&
        p.format !== 'mlx' &&
        p.active !== false
    )
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .map((p) => ({
      id: p.model_name,
      downloads: 0,
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
  private rows = staffPicks(baseline)
  private refreshed = 0
  private refreshing: Promise<void> | undefined
  private path: string
  constructor(
    directory: string,
    private request: typeof fetch
  ) {
    this.path = join(directory, 'terminal-model-catalog.json')
  }
  async list(query: string, signal: AbortSignal, onRefresh?: (rows: HubRepository[]) => void) {
    const cached = await readDocument<{ at: number; rows: HubRepository[] } | null>(this.path, null)
    if (cached?.rows.length) {
      this.rows = cached.rows
      this.refreshed = cached.at
    }
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
    const response = await this.request(STAFF_PICKS_URL, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    })
    if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`)
    this.rows = staffPicks(await response.json())
    this.refreshed = Date.now()
    await writeDocument(this.path, { at: this.refreshed, rows: this.rows })
  }
}
