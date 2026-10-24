import { engineName } from '../../../workspace-view/index.js'
export interface LibraryRow {
  id: string
  name: string
  category: string
  description: string
  source?: Record<string, unknown>
}
export type LibraryView = 'installed' | 'catalog' | 'engines' | 'downloads' | 'cloud' | 'endpoint'
export const CATEGORIES = ['text', 'image', 'video', 'embedding', 'decision'] as const
export const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
export function libraryRows(value: unknown, kind: LibraryView): LibraryRow[] {
  const o = record(value)
  const entries: unknown[] = Array.isArray(value)
    ? value
    : Array.isArray(o['rows'])
      ? o['rows']
      : Array.isArray(o['engines'])
        ? o['engines']
        : []
  return entries.map((entry) => {
    const r = record(entry),
      active = record(r['active'])
    return {
      id: String(r['id'] ?? r['engine'] ?? ''),
      name:
        kind === 'engines'
          ? engineName(String(r['engine'] ?? r['id'] ?? ''))
          : String(r['name'] ?? r['id'] ?? ''),
      category: String(r['category'] ?? kind),
      source: kind === 'engines' ? r : record(r['source']),
      description:
        kind === 'engines'
          ? active['version']
            ? `Installed · ${active['version']} · ${active['variant']}`
            : r['error']
              ? String(record(r['error'])['message'] ?? 'Unavailable')
              : Array.isArray(r['builds']) && r['builds'].length
                ? 'Installed'
                : 'Not installed'
          : String(r['description'] ?? ''),
    }
  })
}
