/**
 * Changing one value in `config.json`: what `atc config set|unset` and the terminal UI's Config
 * screen both do. The value is typed and checked against the field table before anything is
 * written; unknown keys in the file survive.
 */

import { AtcError } from '../errors/index.js'
import { writeConfigFile } from './file.js'
import { checkValue, coerceValue } from './parse.js'
import type { ResolvedConfig } from './resolve.js'
import { fieldFor, setAt } from './schema.js'
import type { AtcConfig, FieldSpec } from './schema.js'

export interface ConfigEdit {
  key: string
  value: unknown
  /** An `ATC_*` variable overrides the key, so the file change does not apply while it is set. */
  overriddenByEnv: boolean
}

function knownField(key: string): FieldSpec {
  const field = fieldFor(key)
  if (!field)
    throw new AtcError('ATC_USAGE', `Unknown config key '${key}'.`, { hint: 'see `atc config list`' })
  return field
}

async function writeKey(
  configFile: string,
  current: ResolvedConfig,
  key: string,
  value: unknown
): Promise<ConfigEdit> {
  const fileConfig: AtcConfig = structuredClone(current.fileValues)
  setAt(fileConfig as unknown as Record<string, unknown>, key, value)
  await writeConfigFile(configFile, fileConfig, current.file?.extra ?? {})
  return { key, value, overriddenByEnv: current.sources[key] === 'env' }
}

/** Type `raw` for the field, check it, and write it into the file. */
export async function setConfigValue(
  configFile: string,
  current: ResolvedConfig,
  key: string,
  raw: string
): Promise<ConfigEdit> {
  const field = knownField(key)
  const value = coerceValue(field, raw)
  const problem = checkValue(field, value)
  if (problem) throw new AtcError('ATC_CONFIG_INVALID', problem)
  return writeKey(configFile, current, key, value)
}

/** Put the default back into the file (or drop the key when the default is "unset"). */
export async function unsetConfigValue(
  configFile: string,
  current: ResolvedConfig,
  key: string
): Promise<ConfigEdit> {
  const defaultValue = knownField(key).default
  const edit = await writeKey(
    configFile,
    current,
    key,
    defaultValue === undefined ? undefined : structuredClone(defaultValue)
  )
  return { ...edit, value: defaultValue ?? null }
}
