import type { WorkspaceField, WorkspaceOperation } from '../../../contract/index.js'
import type { WorkspaceState } from '../state.js'
export interface OperationField {
  path: string
  schema: WorkspaceField
  required: boolean
}
export function operationFields(operation: WorkspaceOperation): OperationField[] {
  const fields: OperationField[] = []
  function add(properties: Record<string, WorkspaceField>, required: readonly string[], prefix = '') {
    for (const [name, schema] of Object.entries(properties)) {
      const path = prefix + name
      const nested = schema as WorkspaceField & {
        properties?: Record<string, WorkspaceField>
        required?: string[]
      }
      if (schema.type === 'object' && nested.properties)
        add(nested.properties, nested.required ?? [], path + '.')
      else fields.push({ path, schema, required: required.includes(name) })
    }
  }
  add(operation.inputSchema.properties, operation.inputSchema.required)
  return fields
}
export function inputObject(raw: string): Record<string, unknown> {
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Input must be a JSON object.')
  return value as Record<string, unknown>
}
export function fieldValue(raw: string, path: string): unknown {
  let result: unknown = inputObject(raw)
  for (const key of path.split('.'))
    result = result && typeof result === 'object' ? (result as Record<string, unknown>)[key] : undefined
  return result
}
export function setField(raw: string, path: string, value: unknown): string {
  const result = inputObject(raw),
    keys = path.split('.')
  let node = result
  for (const key of keys.slice(0, -1)) {
    if (!node[key] || typeof node[key] !== 'object' || Array.isArray(node[key])) node[key] = {}
    node = node[key] as Record<string, unknown>
  }
  const leaf = keys.at(-1)!
  if (value === undefined) delete node[leaf]
  else node[leaf] = value
  return JSON.stringify(result)
}
export function parseField(field: WorkspaceField, raw: string): unknown {
  if (!raw.trim()) return undefined
  if (field.type === 'object' || field.type === 'array') {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || (field.type === 'array') !== Array.isArray(value))
      throw new Error(`Expected ${field.type}.`)
    return value
  }
  if (field.type === 'number' || field.type === 'integer') {
    const value = Number(raw)
    if (!Number.isFinite(value) || (field.type === 'integer' && !Number.isInteger(value)))
      throw new Error(`Enter a valid ${field.type}.`)
    if (field.minimum != null && value < field.minimum) throw new Error(`Minimum: ${field.minimum}`)
    if (field.maximum != null && value > field.maximum) throw new Error(`Maximum: ${field.maximum}`)
    return value
  }
  return raw
}
export function operationChoices(s: WorkspaceState) {
  if (s.toolGroup.startsWith('task:'))
    return s.operations.filter((o) => o.name.startsWith(`media.${s.toolGroup.slice(5)}.`))
  const groups: Record<string, string[]> = {
    server: ['api', 'connection', 'keys', 'remote', 'hardware', 'logs', 'config'],
    runtime: ['api', 'remote', 'settings', 'environments', 'config'],
    diagnostics: ['hardware', 'logs'],
    models: ['models', 'engines', 'settings', 'environments', 'artifacts', 'setup'],
    playground: ['chat', 'media'],
  }
  const rows = s.operations.filter((o) => (groups[s.toolGroup] ?? [s.toolGroup]).includes(o.group))
  const preferred = [
    'media.image.create',
    'media.video.create',
    'media.embedding.run',
    'media.decision.run',
    'media.router.run',
    'chat.complete',
  ]
  return s.toolGroup === 'playground'
    ? rows.sort((a, b) => {
        const rank = (name: string) => (preferred.includes(name) ? preferred.indexOf(name) : 100)
        return rank(a.name) - rank(b.name)
      })
    : rows
}
export function defaultInput(operation: WorkspaceOperation, s: WorkspaceState) {
  let raw = '{}'
  for (const f of operationFields(operation))
    if (f.schema.default !== undefined) raw = setField(raw, f.path, f.schema.default)
  if ('model_id' in operation.inputSchema.properties && s.model) raw = setField(raw, 'model_id', s.model)
  if ('provider' in operation.inputSchema.properties && s.engine)
    raw = setField(raw, 'provider', s.engine.split('|')[0])
  if (operation.name === 'chat.complete' && s.model)
    raw = JSON.stringify({ request: { model: s.model, messages: [{ role: 'user', content: '' }] } })
  return raw
}
