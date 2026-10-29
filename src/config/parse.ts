/**
 * Hand parsers driven by the field table: a config document, a single value typed from a string
 * (`config set`, environment variables), and the environment overrides.
 */

import { apiPrefixError } from '../workspace-view/index.js'
import { AtcError } from '../errors/index.js'
import { envNameFor, FIELDS, getAt, setAt } from './schema.js'
import type { AtcConfig, FieldSpec } from './schema.js'

export interface ParsedConfig {
  config: AtcConfig
  /** Unknown keys, preserved so `config set` never drops what a newer atc wrote. */
  extra: Record<string, unknown>
  warnings: string[]
}

/** Interpret a string the way a flag, `config set` or an env var supplies it. */
export function coerceValue(field: FieldSpec, raw: string): unknown {
  const text = raw.trim()
  switch (field.type) {
    case 'string':
      return text
    case 'number': {
      const n = Number(text)
      if (text === '' || !Number.isFinite(n)) throw invalid(field, raw, 'a number')
      return n
    }
    case 'boolean':
      if (['true', '1', 'yes', 'on'].includes(text.toLowerCase())) return true
      if (['false', '0', 'no', 'off'].includes(text.toLowerCase())) return false
      throw invalid(field, raw, 'true or false')
    case 'string[]':
      return text === ''
        ? []
        : text
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
    case 'enum':
      if (!field.values?.includes(text)) throw invalid(field, raw, `one of ${field.values?.join(', ')}`)
      return text
  }
}

/** Check a value already typed (from JSON) against the field; returns the problem, if any. */
export function checkValue(field: FieldSpec, value: unknown): string | undefined {
  if (field.path === 'api.prefix') return apiPrefixError(value)
  const type = field.type
  if (type === 'string' && typeof value !== 'string') return `${field.path} must be a string`
  if (type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return `${field.path} must be a number`
    if (field.min !== undefined && value < field.min) return `${field.path} must be ≥ ${field.min}`
    if (field.max !== undefined && value > field.max) return `${field.path} must be ≤ ${field.max}`
  }
  if (type === 'boolean' && typeof value !== 'boolean') return `${field.path} must be true or false`
  if (type === 'string[]' && !(Array.isArray(value) && value.every((v) => typeof v === 'string')))
    return `${field.path} must be a list of strings`
  if (type === 'enum' && !(typeof value === 'string' && field.values?.includes(value)))
    return `${field.path} must be one of ${field.values?.join(', ')}`
  return undefined
}

function invalid(field: FieldSpec, raw: string, expected: string): AtcError {
  return new AtcError('ATC_CONFIG_INVALID', `${field.path}: '${raw}' is not ${expected}.`)
}

/** Validate a raw document (already migrated) field by field; unknown keys become `extra`. */
export function validateConfig(raw: Record<string, unknown>): ParsedConfig {
  const problems: string[] = []
  const warnings: string[] = []
  const config: Record<string, unknown> = { version: raw['version'] }
  const known = new Set<string>()
  for (const field of FIELDS) {
    known.add(field.path.split('.')[0] as string)
    const value = getAt(raw, field.path)
    if (value === undefined || value === null) {
      if (field.default !== undefined) setAt(config, field.path, structuredClone(field.default))
      continue
    }
    const problem = checkValue(field, value)
    if (problem) problems.push(problem)
    else setAt(config, field.path, value)
  }
  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'version' || known.has(key)) continue
    extra[key] = value
    warnings.push(`unknown key '${key}' kept as is`)
  }
  for (const section of known) {
    const object = raw[section]
    if (object === null || typeof object !== 'object') continue
    for (const key of Object.keys(object as Record<string, unknown>)) {
      const path = `${section}.${key}`
      if (!FIELDS.some((f) => f.path === path)) {
        setAt(extra, path, (object as Record<string, unknown>)[key])
        warnings.push(`unknown key '${path}' kept as is`)
      }
    }
  }
  if (problems.length) {
    throw new AtcError('ATC_CONFIG_INVALID', 'The config file has invalid values.', {
      details: problems.join('; '),
      hint: 'fix the file or `atc config unset <key>`',
    })
  }
  return { config: config as unknown as AtcConfig, extra, warnings }
}

export function parseConfigDocument(text: string): Record<string, unknown> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new AtcError('ATC_CONFIG_INVALID', 'The config file is not valid JSON.', {
      details: (error as Error).message,
    })
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    throw new AtcError('ATC_CONFIG_INVALID', 'The config file must hold a JSON object.')
  return raw as Record<string, unknown>
}

/** `ATC_*` variables, typed by their field. */
export function envOverrides(
  env: NodeJS.ProcessEnv
): Array<{ field: FieldSpec; value: unknown; name: string }> {
  const out: Array<{ field: FieldSpec; value: unknown; name: string }> = []
  for (const field of FIELDS) {
    const name = envNameFor(field)
    const raw = env[name]
    if (raw === undefined) continue
    out.push({ field, value: coerceValue(field, raw), name })
  }
  return out
}
