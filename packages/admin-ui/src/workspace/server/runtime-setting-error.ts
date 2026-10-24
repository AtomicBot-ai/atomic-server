import { text } from '../types'
import type { RecordValue } from '../types'

/** Explain invalid settings before they can be persisted. */
export function runtimeSettingError(field: RecordValue, value: unknown): string {
  if (field.type !== 'number' && typeof value !== 'number') return ''
  const n = Number(value)
  const whole = ['api.port', 'admin.port'].includes(text(field.path))
  const valid =
    text(value, '').trim() !== '' &&
    Number.isFinite(n) &&
    (!whole || Number.isInteger(n)) &&
    (typeof field.min !== 'number' || n >= field.min) &&
    (typeof field.max !== 'number' || n <= field.max)
  if (valid) return ''
  const kind = whole ? 'whole number' : 'number'
  if (typeof field.min === 'number' && typeof field.max === 'number')
    return `Enter a ${kind} from ${field.min} to ${field.max}.`
  if (typeof field.min === 'number') return `Enter a ${kind} of ${field.min} or more.`
  if (typeof field.max === 'number') return `Enter a ${kind} of ${field.max} or less.`
  return `Enter a ${kind}.`
}
