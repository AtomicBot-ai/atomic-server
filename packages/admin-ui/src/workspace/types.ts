export type RecordValue = Record<string, unknown>
export type Execute = <T = unknown>(operation: string, input?: RecordValue) => Promise<T>
export type Page = 'playground' | 'server' | 'catalog'
export function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : {}
}
export function rows(value: unknown): RecordValue[] {
  if (Array.isArray(value)) return value.map(record)
  const data = record(value)
  const items =
    data.descriptors ??
    data.items ??
    data.models ??
    data.engines ??
    data.jobs ??
    data.data ??
    data.builds ??
    data.rows
  return Array.isArray(items) ? items.map(record) : []
}
export function text(value: unknown, fallback = '—'): string {
  return value === undefined || value === null || value === '' ? fallback : String(value)
}
export function bytes(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`
  return `${Math.round(n / 1e3)} KB`
}
export function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}
