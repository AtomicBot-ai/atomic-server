import { record, text } from '../../types'
import type { RecordValue } from '../../types'

/** Keep catalog metadata intact; byte counts describe the model file, not a planned bundle. */
export function catalogDownloadOptions(model: RecordValue, files?: RecordValue[]) {
  const source = record(model.source)
  const quants = record(source.transformer).quants ?? source.quants ?? model.quants
  const sizeOf = (row: RecordValue) => {
    const size = row.bytes ?? row.size ?? row.size_bytes
    return typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : null
  }
  if (files)
    return files.map((file) => ({
      value: text(file.filename ?? file.path),
      label: text(file.filename ?? file.path),
      size: sizeOf(file),
      recommended: false,
    }))
  if (Array.isArray(quants) && quants.length)
    return quants.flatMap((quant) => {
      const row = record(quant)
      const value = typeof quant === 'string' ? quant : text(row.id ?? row.name, '')
      return value
        ? [
            {
              value,
              label: text(row.label, value.toUpperCase()),
              size: sizeOf(row),
              recommended: row.recommended === true,
            },
          ]
        : []
    })
  return [{ value: '', label: 'Default', size: sizeOf(source) ?? sizeOf(model), recommended: false }]
}
