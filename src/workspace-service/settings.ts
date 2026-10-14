/** Published descriptor assets from the exact pinned @atomic-chat/core version; no local schema fork. */
import llama from '../../node_modules/@atomic-chat/core/src/settings/schema/llamacpp-upstream.json' with { type: 'json' }
import turbo from '../../node_modules/@atomic-chat/core/src/settings/schema/llamacpp.json' with { type: 'json' }
import prism from '../../node_modules/@atomic-chat/core/src/settings/schema/atomic-prism.json' with { type: 'json' }
import mlx from '../../node_modules/@atomic-chat/core/src/settings/schema/mlx.json' with { type: 'json' }
import tensor from '../../node_modules/@atomic-chat/core/src/settings/schema/tensorrt-llm.json' with { type: 'json' }
import vllm from '../../node_modules/@atomic-chat/core/src/settings/schema/vllm.json' with { type: 'json' }
import foundation from '../../node_modules/@atomic-chat/core/src/settings/schema/foundation-models.json' with { type: 'json' }
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
const schemas: Record<string, unknown[]> = {
  'llamacpp-upstream': llama,
  'llamacpp': turbo,
  'atomic-prism': prism,
  mlx,
  'tensorrt-llm': tensor,
  vllm,
  'foundation-models': foundation,
}
export function engineSettingsSchema(provider: string) {
  if (!schemas[provider])
    throw new AtcError('ATC_USAGE', 'This engine uses its task configuration instead of provider settings.')
  return { provider, core_version: '0.13.6', descriptors: structuredClone(schemas[provider]) }
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
    if (problem) throw new AtcError('ATC_CONFIG_INVALID', problem)
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
