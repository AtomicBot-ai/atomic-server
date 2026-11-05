/**
 * The effective config and where each value came from: flags > `ATC_*` env > file > defaults.
 * `config list` shows the source column; commands read `values`.
 */

import { migrateConfig } from './migrations.js'
import { envOverrides, parseConfigDocument, validateConfig } from './parse.js'
import type { ParsedConfig } from './parse.js'
import { defaultConfig, FIELDS, getAt, setAt } from './schema.js'
import type { AtcConfig } from './schema.js'

export type ConfigSource = 'default' | 'file' | 'env' | 'flag'

export interface ResolvedConfig {
  values: AtcConfig
  /** Values to persist on a config edit, before applying environment and flag overrides. */
  fileValues: AtcConfig
  sources: Record<string, ConfigSource>
  /** What the file held, for writing it back without losing unknown keys. */
  file: ParsedConfig | undefined
  warnings: string[]
}

export function resolveConfig(input: {
  defaults?: AtcConfig
  fileText?: string | undefined
  env: NodeJS.ProcessEnv
  /** Overrides a command derived from its own flags, by field path. */
  flags?: Record<string, unknown>
}): ResolvedConfig {
  const defaults = input.defaults ?? defaultConfig()
  const values = structuredClone(defaults) as unknown as Record<string, unknown>
  const sources: Record<string, ConfigSource> = {}
  const warnings: string[] = []
  for (const field of FIELDS) sources[field.path] = 'default'

  let file: ParsedConfig | undefined
  if (input.fileText !== undefined) {
    const migrated = migrateConfig(parseConfigDocument(input.fileText))
    file = validateConfig(migrated.raw)
    if (migrated.migratedFrom !== undefined)
      warnings.push(`config migrated from version ${migrated.migratedFrom}`)
    warnings.push(...file.warnings)
    for (const field of FIELDS) {
      const value = getAt(file.config, field.path)
      if (value !== undefined && value !== getAt(migrated.raw, field.path)) continue // default filled in
      if (getAt(migrated.raw, field.path) !== undefined) {
        setAt(values, field.path, value)
        sources[field.path] = 'file'
      }
    }
  }
  for (const { field, value } of envOverrides(input.env)) {
    setAt(values, field.path, value)
    sources[field.path] = 'env'
  }
  for (const [path, value] of Object.entries(input.flags ?? {})) {
    if (value === undefined) continue
    setAt(values, path, value)
    sources[path] = 'flag'
  }
  return {
    values: values as unknown as AtcConfig,
    sources,
    file,
    fileValues: file?.config ?? defaults,
    warnings,
  }
}
