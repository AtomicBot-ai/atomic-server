import { AtcError } from '../errors/index.js'
import type { WorkspaceInput, WorkspaceOperation, WorkspaceField } from '../contract/index.js'
export function inputFor(operation: WorkspaceOperation, raw: unknown): WorkspaceInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new AtcError('ATC_USAGE', 'Input must be an object.')
  const input = raw as WorkspaceInput
  for (const key of Object.keys(input)) {
    const field = operation.inputSchema.properties[key]
    if (!field) throw new AtcError('ATC_USAGE', `Unknown input: ${key}`)
    validateField(field, input[key], key)
  }
  for (const key of operation.inputSchema.required)
    if (input[key] === undefined || input[key] === '') throw new AtcError('ATC_USAGE', `${key} is required.`)
  return input
}
export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}
export function segment(value: unknown): string {
  const text = String(value ?? '')
  if (!text || text === '.' || text === '..' || [...text].some((c) => c.charCodeAt(0) < 32))
    throw new AtcError('ATC_USAGE', 'Invalid identifier.')
  return encodeURIComponent(text)
}
/** Recursive redaction protects session keys and engine environments in read-only views. */
export function sanitized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitized)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          !/^(?:api[_-]?key|access_token|refresh_token|token|authorization|secret|password|env|env_vars|environment_vars|prompt_preview|reply_preview)$/i.test(
            key
          )
      )
      .map(([key, item]) => [key, sanitized(item)])
  )
}

function validateField(field: WorkspaceField, value: unknown, path: string): void {
  const valid =
    field.type === undefined ||
    (field.type === 'array'
      ? Array.isArray(value)
      : field.type === 'object'
        ? value !== null && typeof value === 'object' && !Array.isArray(value)
        : field.type === 'integer'
          ? Number.isInteger(value)
          : typeof value === field.type)
  if (!valid) throw new AtcError('ATC_USAGE', `${path} must be ${field.type}.`)
  if (field.enum && !field.enum.includes(String(value)))
    throw new AtcError('ATC_USAGE', `Choose ${field.enum.join(', ')} for ${path}.`)
  if (
    typeof value === 'number' &&
    (!Number.isFinite(value) ||
      (field.minimum !== undefined && value < field.minimum) ||
      (field.maximum !== undefined && value > field.maximum))
  )
    throw new AtcError('ATC_USAGE', `${path} is outside the supported range.`)
  if (field.type === 'object' && field.properties) {
    const properties = object(value)
    for (const key of field.required ?? [])
      if (properties[key] === undefined || properties[key] === '')
        throw new AtcError('ATC_USAGE', `${path}.${key} is required.`)
    for (const [key, item] of Object.entries(properties)) {
      const child = field.properties[key]
      if (child) validateField(child, item, `${path}.${key}`)
      else if (field.additionalProperties === false)
        throw new AtcError('ATC_USAGE', `Unknown input: ${path}.${key}`)
    }
  }
  if (field.type === 'array' && field.items)
    (value as unknown[]).forEach((item, i) => validateField(field.items!, item, `${path}[${i}]`))
}
