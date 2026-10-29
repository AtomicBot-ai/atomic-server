/** Provider settings come from the embedded core (`@atomic-chat/core/settings`); config settings are atc's own. */
import { CORE_VERSION } from '@atomic-chat/core'
import type { LocalProviderId } from '@atomic-chat/core/contracts'
import { LOCAL_PROVIDER_IDS, settingsSchema } from '@atomic-chat/core/settings'
import {
  FIELDS,
  checkValue,
  fieldFor,
  readTextFile,
  resolveConfig,
  setAt,
  writeConfigFile,
} from '../config/index.js'
import type { AtcPaths, AtcConfig } from '../config/index.js'
import { AtcError } from '../errors/index.js'
const isLocalProvider = (provider: string): provider is LocalProviderId =>
  (LOCAL_PROVIDER_IDS as readonly string[]).includes(provider)
export function engineSettingsSchema(provider: string) {
  if (!isLocalProvider(provider))
    throw new AtcError('ATC_USAGE', 'This engine uses its task configuration instead of provider settings.')
  return { provider, core_version: CORE_VERSION, descriptors: settingsSchema(provider) }
}
export function workspaceConfig(config: AtcConfig) {
  return { values: config, fields: FIELDS.filter((f) => f.path !== 'api.cors') }
}
/** Persist validated settings; listener and engine changes take effect only on the corresponding restart. */
export async function updateWorkspaceConfig(
  paths: AtcPaths,
  config: AtcConfig,
  values: Record<string, unknown>
) {
  for (const [key, value] of Object.entries(values)) {
    const field = fieldFor(key)
    if (!field || key === 'api.cors') throw new AtcError('ATC_USAGE', `Unsupported setting: ${key}.`)
    const problem = checkValue(field, value)
    if (problem) throw new AtcError('ATC_USAGE', problem)
  }
  const resolved = resolveConfig({ fileText: await readTextFile(paths.configFile), env: {} }),
    next = resolved.file?.config ?? structuredClone(config)
  for (const [key, value] of Object.entries(values))
    setAt(next as unknown as Record<string, unknown>, key, value)
  await writeConfigFile(paths.configFile, next, resolved.file?.extra ?? {})
  for (const [key, value] of Object.entries(values))
    setAt(config as unknown as Record<string, unknown>, key, value)
  return {
    saved: Object.keys(values),
    restart_required: Object.keys(values).some((k) => /^(api|admin|proxy|managed|log)\./.test(k)),
  }
}
