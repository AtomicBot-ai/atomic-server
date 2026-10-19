/** Pure derivations for the controller: config rows and the summary of a saved edit. */

import { FIELDS, getAt } from '../config/index.js'
import type { ResolvedConfig } from '../config/index.js'
import type { ConfigRow } from './state.js'

/** A value the way `atc config get` prints it; lists as the comma list `config set` accepts. */
export function formatConfigValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.join(',')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function configRows(resolved: ResolvedConfig): ConfigRow[] {
  return FIELDS.map((field) => ({
    path: field.path,
    type: field.type,
    value: formatConfigValue(getAt(resolved.values, field.path)),
    source: resolved.sources[field.path] ?? 'default',
    description: field.description,
    values: field.values,
  }))
}

/** `api.port = 1338`: the one-line summary of a saved change. */
export function describeEdit(key: string, value: unknown): string {
  return `${key} = ${JSON.stringify(value ?? null)}`
}
