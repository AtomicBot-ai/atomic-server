import { AtcError, defineCommand } from '../../cli/index.js'
import type { CommandContext } from '../../cli/index.js'
import { attachIfRunning } from '../../core-link/index.js'
import { fieldFor, FIELDS, getAt, setConfigValue, unsetConfigValue } from '../../config/index.js'
import { engineConfigRows, engineKey, getEngineSetting, setEngineSetting } from '../models/engine-settings.js'

const get = defineCommand({
  name: 'get',
  summary: 'Print one value',
  positionals: [{ name: 'key', description: 'Dotted key, e.g. api.port', required: true }],
  run: async (inv, ctx) => {
    const key = inv.positionals[0] as string
    if (engineKey(key)) return getEngineSetting(ctx, key)
    if (!fieldFor(key))
      throw new AtcError('ATC_USAGE', `Unknown config key '${key}'.`, { hint: 'see `atc config list`' })
    const config = await ctx.config()
    const value = getAt(config.values, key)
    ctx.out.result({ key, value: value ?? null, source: config.sources[key] }, () =>
      ctx.out.line(
        value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
      )
    )
    return 0
  },
})

const set = defineCommand({
  name: 'set',
  summary: 'Set one value in the config file',
  positionals: [
    { name: 'key', description: 'Dotted key, e.g. api.port', required: true },
    { name: 'value', description: 'Value as text (lists comma-separated)', required: true },
  ],
  examples: [
    'atc config set api.port 1337',
    'atc config set models.autoLoad qwen3-8b,gemma-4b',
    'atc config set engine.tensorrt-llm.context_length 16384',
  ],
  run: async (inv, ctx) => {
    const [key, raw] = inv.positionals as [string, string]
    if (engineKey(key)) return setEngineSetting(ctx, key, raw)
    if (!fieldFor(key))
      throw new AtcError('ATC_USAGE', `Unknown config key '${key}'.`, { hint: 'see `atc config list`' })
    const { value, overriddenByEnv } = await setConfigValue(
      ctx.paths.configFile,
      await ctx.config(),
      key,
      raw
    )
    ctx.out.result({ key, value }, () => ctx.out.success(`${key} = ${JSON.stringify(value)}`))
    if (overriddenByEnv) ctx.out.warn(`an environment variable currently overrides ${key}`)
    else if (key === 'telemetry.enabled') await applyTelemetry(ctx, value === true)
    return 0
  },
})

const unset = defineCommand({
  name: 'unset',
  summary: 'Remove one value from the config file (the default applies again)',
  positionals: [{ name: 'key', description: 'Dotted key', required: true }],
  run: async (inv, ctx) => {
    const key = inv.positionals[0] as string
    if (!fieldFor(key)) throw new AtcError('ATC_USAGE', `Unknown config key '${key}'.`)
    const { value } = await unsetConfigValue(ctx.paths.configFile, await ctx.config(), key)
    ctx.out.result({ key, value }, () => ctx.out.success(`${key} reset`))
    return 0
  },
})

const list = defineCommand({
  name: 'list',
  summary: 'Every key with its value and where it comes from',
  run: async (_inv, ctx) => {
    const config = await ctx.config()
    const engine = await engineConfigRows(ctx)
    const text = (v: unknown) =>
      v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    ctx.out.result({ values: config.values, sources: config.sources, engine }, () =>
      ctx.out.table(
        [{ header: 'KEY' }, { header: 'VALUE' }, { header: 'SOURCE' }, { header: 'DESCRIPTION' }],
        [
          ...FIELDS.map((f) => [
            f.path,
            text(getAt(config.values, f.path)),
            config.sources[f.path] ?? 'default',
            f.description,
          ]),
          ...engine.map((r) => [
            r.key,
            text(r.value),
            r.source === 'core' ? 'core' : 'default',
            r.description,
          ]),
        ]
      )
    )
    return 0
  },
})

const path = defineCommand({
  name: 'path',
  summary: 'Print the config file path',
  run: async (_inv, ctx) => {
    ctx.out.result({ path: ctx.paths.configFile, data_folder: ctx.paths.dataFolder }, () =>
      ctx.out.line(ctx.paths.configFile)
    )
    return 0
  },
})

export const configCommand = defineCommand({
  name: 'config',
  summary: 'Read and change atc settings',
  description:
    'atc settings live in <data>/atc/config.json; ATC_* environment variables and flags override them. Engine parameters (engine.<provider>.<key>) belong to the core.',
  group: 'system',
  subcommands: [get, set, unset, list, path],
})

/** A running server reads its config once; the consent goes to its core at once as well. */
async function applyTelemetry(ctx: CommandContext, enabled: boolean): Promise<void> {
  const link = await attachIfRunning((o) => ctx.core.attach(o)).catch(() => undefined)
  if (!link) return
  await link.request('PUT', '/telemetry', { enabled })
  ctx.log.info(`error reports ${enabled ? 'on' : 'off'} for the running server`)
}
