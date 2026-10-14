import { defineCommand, AtcError } from '../cli/index.js'
import type { CommandRun } from '../cli/index.js'
import { ClientKeys } from '../terminal-data/index.js'
import { startApi, streamChat, listChatModels } from '../terminal-service/index.js'
import { workspace } from './control.js'
import { defaultConfig } from '../config/index.js'
export const apiStart: CommandRun = async (inv, ctx) => {
  const config = structuredClone((await ctx.config()).values)
  if (typeof inv.values['host'] === 'string') config.api.host = inv.values['host']
  if (typeof inv.values['port'] === 'string') {
    const port = Number(inv.values['port'])
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new AtcError('ATC_USAGE', 'Choose a port from 1 to 65535.')
    config.api.port = port
  }
  if (typeof inv.values['prefix'] === 'string') config.api.prefix = inv.values['prefix']
  if (inv.values['trusted-host']) config.api.trustedHosts = inv.values['trusted-host'] as string[]
  let key =
    typeof inv.values['api-key'] === 'string' ? inv.values['api-key'] : (ctx.io.env['ATC_API_KEY'] ?? '')
  if (typeof inv.values['api-key-file'] === 'string') {
    const read = await ctx.io.readFile(inv.values['api-key-file'])
    if (read === undefined) throw new AtcError('ATC_USAGE', 'Could not read the API key file.')
    key = read.trim()
  }
  if (inv.values['cors'] === false)
    throw new AtcError('ATC_USAGE', 'CORS cannot be disabled by this Core API. Remove --no-cors.')
  const link = await ctx.core.attach({ launch: true })
  const keys = new ClientKeys(ctx.paths.atcDir)
  await keys.initialize(key)
  if (key)
    await keys
      .ensure(key, 'CLI key')
      .catch((e: Error) => Promise.reject(new AtcError('ATC_USAGE', e.message)))
  await startApi(link, config, key || (await keys.get()))
  const status = await link.server.status()
  ctx.out.result({ ...status, keys_file: keys.path }, () => {
    ctx.out.kv([
      ['API', `http://${status.host}:${status.port}${status.prefix}`],
      ['Authentication', 'Key required (Authorization: Bearer <key>)'],
      ['Keys', keys.path],
    ])
    if (!key) ctx.out.note('manage keys in the terminal UI (`atc`, Server → Keys), or pass --api-key')
  })
  return 0
}
export const apiStop: CommandRun = async (_inv, ctx) => {
  const status = await (await ctx.core.attach()).server.stop()
  ctx.out.result(status, () => ctx.out.line('API stopped. The daemon remains available.'))
  return 0
}
export const apiStatus: CommandRun = async (_inv, ctx) => {
  const status = await (await ctx.core.attach()).server.status()
  ctx.out.result(status, () =>
    ctx.out.kv([['API', status.running ? `http://${status.host}:${status.port}${status.prefix}` : 'Stopped']])
  )
  return 0
}
export const chatCommand = defineCommand({
  name: 'chat',
  summary: 'Send a message to an OpenAI-compatible model',
  group: 'access',
  positionals: [{ name: 'message', description: 'Message to send', required: true, rest: true }],
  options: {
    endpoint: { type: 'string', description: 'Base URL including /v1' },
    model: { type: 'string', description: 'Model ID' },
  },
  examples: ['atc chat --model my-model Hello'],
  run: async (inv, ctx) => {
    const config = await ctx.config()
    const local = await workspace(ctx, false)
      .then((service) => service.snapshot())
      .catch(() => null)
    // Config edits serialize defaults too; a saved default is still the local-server shortcut.
    const useLocal =
      inv.values['endpoint'] === undefined &&
      config.sources['tui.endpoint'] !== 'env' &&
      config.values.tui.endpoint === defaultConfig().tui.endpoint
    const endpoint = String(
      inv.values['endpoint'] ?? (useLocal && local ? local.api.endpoint : config.values.tui.endpoint)
    )
    if (useLocal && local && !local.api.running)
      throw new AtcError('ATC_USAGE', 'Start the API before chatting.', { hint: 'atc api start' })
    // A local client key must never be sent to an explicitly configured remote service.
    const key =
      ctx.io.env['ATC_CHAT_API_KEY'] ??
      ctx.io.env['ATC_API_KEY'] ??
      (local?.api.running && endpoint === local.api.endpoint
        ? await new ClientKeys(ctx.paths.atcDir).get()
        : '')
    const model =
      String(inv.values['model'] ?? config.values.tui.model) ||
      (await listChatModels(endpoint, ctx.io.fetch, key))[0]
    if (!model)
      throw new AtcError('ATC_USAGE', 'No model is available. Connect Atomic Chat and load a model first.')
    let reply = ''
    await streamChat({
      endpoint,
      model,
      key,
      request: ctx.io.fetch,
      signal: ctx.signal,
      messages: [{ role: 'user', content: inv.positionals.join(' ') }],
      onText: (text) => {
        reply += text
        if (!ctx.flags.json) ctx.io.stdout(text)
      },
    })
    if (ctx.flags.json) ctx.out.result({ model, reply }, () => undefined)
    else ctx.io.stdout('\n')
    return 0
  },
})
