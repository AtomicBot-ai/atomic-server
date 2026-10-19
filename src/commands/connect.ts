import { join } from 'node:path'
import { AGENTS, prepareAgent, runAgent } from '../agent-launch/index.js'
import { AtcError, defineCommand } from '../cli/index.js'
import { ClientKeys } from '../terminal-data/index.js'
import { workspace, operation } from './control.js'
export const connectCommand = defineCommand({
  name: 'connect',
  summary: 'Connection details or launch an installed agent',
  group: 'access',
  positionals: [
    { name: 'agent', description: 'atomic-agent, claude, codex or opencode; omit for connection details' },
  ],
  options: {
    'model': { type: 'string', description: 'Model ID; defaults to first ready chat model' },
    'key-id': { type: 'string', description: 'Named API key ID' },
    'export': { type: 'boolean', description: 'Return an isolated connection profile; do not launch' },
  },
  run: async (inv, ctx) => {
    const id = inv.positionals[0]
    if (!id) return operation(ctx, 'connection.info')
    const agent = AGENTS.find((a) => a.id === id)
    if (!agent) throw new AtcError('ATC_USAGE', `Choose ${AGENTS.map((a) => a.id).join(', ')}.`)
    const service = await workspace(ctx)
    const state = await service.snapshot()
    if (!state.api.running)
      throw new AtcError('ATC_USAGE', 'Start the API before connecting an agent.', { hint: 'atc api start' })
    const model =
      typeof inv.values['model'] === 'string'
        ? inv.values['model']
        : state.services.find((s) => s.kind === 'chat')?.model
    if (!model)
      throw new AtcError('ATC_USAGE', 'Load a chat model before connecting an agent.', {
        hint: 'atc models list; atc run <model>',
      })
    const keyId = typeof inv.values['key-id'] === 'string' ? inv.values['key-id'] : undefined
    if (inv.values['export'] || ctx.flags.json)
      return operation(ctx, 'connection.profile', { agent: id, model, ...(keyId ? { key_id: keyId } : {}) })
    if (!ctx.io.isTTY.stdin || !ctx.io.isTTY.stdout)
      throw new AtcError('ATC_USAGE', 'Use --export in a script, or launch the agent from a terminal.')
    const keys = new ClientKeys(ctx.paths.atcDir)
    const key = await keys.get(keyId)
    if (!key) throw new AtcError('ATC_USAGE', 'The selected API key no longer exists.')
    const launch = await prepareAgent(agent.id, state.api.endpoint, model, key, {
      env: ctx.io.env,
      cwd: ctx.io.cwd,
      folder: join(ctx.paths.atcDir, 'agents'),
      find: ctx.host.findOnPath,
      exec: ctx.host.exec,
    })
    await runAgent(launch)
    return 0
  },
})
