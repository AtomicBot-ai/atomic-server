import type { LibraryRow } from './library-model.js'
import type { Canvas } from '../draw/canvas.js'
import { COLORS, text } from '../draw/canvas.js'
import { engineName } from '../../../workspace-view/index.js'
export type Column = { key: string; label: string; offset: number; width: number }
/** Hide secondary columns as the terminal narrows; never invent missing catalog metadata. */
export function catalogColumns(width: number): Column[] {
  const fields =
    width >= 112
      ? [
          ['parameters', 'Parameters', 11],
          ['format', 'Format', 10],
          ['context', 'Context', 9],
          ['capabilities', 'Capabilities', 14],
          ['size', 'Download size', 15],
          ['device', 'This device', 13],
          ['engine', 'Engines', 16],
        ]
      : width >= 74
        ? [
            ['parameters', 'Parameters', 11],
            ['format', 'Format', 10],
            ['size', 'Download size', 15],
            ['device', 'This device', 13],
          ]
        : [['format', 'Format', 12]]
  const nameWidth = width - 7 - fields.reduce((sum, f) => sum + Number(f[2]), 0)
  let offset = 3
  return [['name', 'Model', nameWidth], ...fields].map(([key, label, length]) => {
    const col = { key: String(key), label: String(label), offset, width: Number(length) }
    offset += col.width
    return col
  })
}
export function catalogValue(model: LibraryRow, key: string): string | number | undefined {
  const source = model.source ?? {}
  if (key === 'capabilities') {
    const value = source['capabilities']
    return Array.isArray(value)
      ? value.filter((v) => typeof v === 'string').join(' ') || undefined
      : typeof value === 'string'
        ? value
        : undefined
  }
  const value =
    key === 'name'
      ? model.name
      : key === 'format'
        ? String(source['format'] ?? 'gguf').toUpperCase()
        : key === 'parameters'
          ? (source['parameters'] ?? source['params'] ?? source['parameter_count'])
          : key === 'context'
            ? (source['context_length'] ?? source['context'])
            : key === 'size'
              ? (source['size_bytes'] ?? source['download_bytes'] ?? source['size'])
              : (source['engine'] ?? source['provider'])
  return typeof value === 'number' || typeof value === 'string' ? value : undefined
}
function shown(model: LibraryRow, key: string, status: string) {
  if (key === 'device') return status || '—'
  const value = catalogValue(model, key)
  if (value === undefined) return '—'
  if (key === 'engine') return engineName(String(value))
  if (key === 'size' && typeof value === 'number')
    return value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GB` : `${Math.round(value / 1024 ** 2)} MB`
  return String(value)
}
export function drawCatalogColumns(c: Canvas, x: number, y: number, width: number, focus: string, sort = '') {
  for (const column of catalogColumns(width)) {
    if (['capabilities', 'device'].includes(column.key)) {
      text(c, x + column.offset, y, column.label, COLORS.muted, column.width - 1)
      continue
    }
    const id = `catalog-column:${column.key}`
    const selected = sort.startsWith(`column:${column.key}:`)
    const indicator = selected ? (sort.endsWith(':asc') ? ' ^' : ' v') : ''
    text(
      c,
      x + column.offset,
      y,
      column.label.slice(0, column.width - 1 - indicator.length) + indicator,
      focus === id || selected ? COLORS.gold : COLORS.muted,
      column.width - 1,
      focus === id ? COLORS.focus : undefined
    )
    c.targets.push({
      id,
      x: x + column.offset,
      y,
      width: column.width - 1,
      height: 1,
      hint: `Sort by ${column.label}`,
    })
  }
}
export function drawCatalogMetadata(
  c: Canvas,
  model: LibraryRow,
  x: number,
  y: number,
  width: number,
  status = ''
) {
  for (const column of catalogColumns(width))
    if (column.key !== 'name')
      text(
        c,
        x + column.offset,
        y,
        shown(model, column.key, status),
        column.key === 'device' && status === 'Loaded' ? COLORS.gold : COLORS.muted,
        column.width - 1
      )
}
