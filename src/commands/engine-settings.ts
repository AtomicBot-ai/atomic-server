/**
 * `atc config get|set|list` for `engine.<provider>.<key>` (spec server-engine-settings): a provider's
 * settings belong to the core of the running server. A key and its value are checked against the
 * provider's schema (`settings.schema`, the descriptors of the embedded core); a write carries the
 * revision read just before it. `version_backend` is the engine build, chosen with `atc engines activate`.
 */

import type { EngineVersionsResponse, SettingDescriptor } from '@atomic-chat/core/contracts'
import { LOCAL_PROVIDER_IDS } from '@atomic-chat/core/settings'
import { AtcError } from '../cli/index.js'
import type { CommandContext } from '../cli/index.js'
import type { WorkspaceClient } from '../workspace-service/index.js'
import { parseSettingValue } from '../workspace-view/index.js'
import { workspace } from './control.js'

const NEXT_LOAD = 'Applies from the next model load.'

/** `engine.<provider>.<key>`, or `undefined` for any other key. */
export function engineKey(raw: string): { provider: string; key: string } | undefined {
  const match = /^engine\.([^.]+)\.(.+)$/.exec(raw)
  return match ? { provider: match[1]!, key: match[2]! } : undefined
}

/** The local providers this host registers, in the core's order. */
async function registered(service: WorkspaceClient): Promise<string[]> {
  const { engines } = (await service.execute('engines.list')) as EngineVersionsResponse
  return (engines ?? [])
    .map((e) => e.engine)
    .filter((e) => (LOCAL_PROVIDER_IDS as readonly string[]).includes(e))
}

async function schemaOf(service: WorkspaceClient, provider: string): Promise<SettingDescriptor[]> {
  const providers = await registered(service)
  if (!providers.includes(provider))
    throw new AtcError('ATC_USAGE', `This server has no engine settings for '${provider}'.`, {
      hint: `providers here: ${providers.join(', ')}`,
    })
  return ((await service.execute('settings.schema', { provider })) as { descriptors: SettingDescriptor[] })
    .descriptors
}

function descriptorOf(descriptors: SettingDescriptor[], provider: string, key: string): SettingDescriptor {
  const found = descriptors.find((d) => d.key === key)
  if (found) return found
  throw new AtcError('ATC_USAGE', `${provider} has no setting '${key}'.`, {
    hint: `keys: ${descriptors.map((d) => d.key).join(', ')}`,
  })
}

async function settingsOf(service: WorkspaceClient, provider: string) {
  const read = (await service.execute('settings.get', { provider })) as {
    revision?: number
    values?: Record<string, unknown>
  }
  return { revision: read.revision, values: read.values ?? {} }
}

const text = (value: unknown) => (typeof value === 'object' ? JSON.stringify(value) : String(value))

export async function getEngineSetting(ctx: CommandContext, raw: string): Promise<number> {
  const { provider, key } = engineKey(raw)!
  const service = await workspace(ctx, false)
  const descriptor = descriptorOf(await schemaOf(service, provider), provider, key)
  const { values } = await settingsOf(service, provider)
  const known = key in values
  const value = known ? values[key] : descriptor.controllerProps.value
  ctx.out.result({ key: raw, value: value ?? null, source: known ? 'core' : 'default' }, () =>
    ctx.out.line(text(value ?? ''))
  )
  return 0
}

export async function setEngineSetting(ctx: CommandContext, raw: string, input: string): Promise<number> {
  const { provider, key } = engineKey(raw)!
  // core-boundary: version_backend — named only to refuse and hide it; the build goes through engines.activate
  if (key === 'version_backend')
    throw new AtcError('ATC_USAGE', 'The engine build is not a setting.', {
      hint: `choose it with atc engines activate ${provider} --build <version>/<variant>`,
    })
  const service = await workspace(ctx, false)
  const parsed = parseSettingValue(descriptorOf(await schemaOf(service, provider), provider, key), input)
  if ('error' in parsed) throw new AtcError('ATC_USAGE', parsed.error)
  const { revision } = await settingsOf(service, provider)
  await service.execute('settings.update', {
    provider,
    values: { [key]: parsed.value },
    ...(revision !== undefined ? { expected_revision: revision } : {}),
  })
  ctx.out.result({ key: raw, value: parsed.value, applies: 'next-load' }, () => {
    ctx.out.success(`${raw} = ${JSON.stringify(parsed.value)}`)
    ctx.out.line(NEXT_LOAD)
  })
  return 0
}

export interface EngineConfigRow {
  key: string
  value: unknown
  source: 'core' | 'default'
  description: string
}

/** `engine.<provider>.*` of every provider this host registers; none while the server is stopped. */
export async function engineConfigRows(ctx: CommandContext): Promise<EngineConfigRow[]> {
  let service: WorkspaceClient
  try {
    service = await workspace(ctx, false)
  } catch (error) {
    if (error instanceof AtcError && error.code === 'ATC_DAEMON_NOT_RUNNING') {
      ctx.log.info('engine.<provider>.* settings are listed while the server runs (atc start)')
      return []
    }
    throw error
  }
  const rows: EngineConfigRow[] = []
  try {
    for (const provider of await registered(service)) {
      const [descriptors, { values }] = await Promise.all([
        schemaOf(service, provider),
        settingsOf(service, provider),
      ])
      for (const d of descriptors)
        if (d.key !== 'version_backend')
          rows.push({
            key: `engine.${provider}.${d.key}`,
            value: d.key in values ? values[d.key] : d.controllerProps.value,
            source: d.key in values ? 'core' : 'default',
            description: d.title,
          })
    }
  } catch (error) {
    // atc's own keys are still worth listing when the core cannot answer for its providers.
    ctx.log.warn(`engine settings: ${error instanceof Error ? error.message : String(error)}`)
  }
  return rows
}
