/** The workspace's server operations: settings, config, the API, connections, keys, guided setup and the log; `NOT_CORE` for any other. */

import { join } from 'node:path'
import { AtcError } from '../errors/index.js'
import {
  AGENTS,
  agentProfile,
  checkAgentWindow,
  configureCoreAgent,
  coreAgent,
  servedWindow,
} from '../agent-launch/index.js'
import type { ClientKeys } from '../terminal-data/index.js'
import {
  CONNECTION_AGENTS,
  WORKSPACE_OPERATIONS,
  type WorkspaceInput,
  type WorkspaceSnapshot,
} from '../contract/index.js'
import type { WorkspaceServiceOptions } from './service-options.js'
import type { WorkspaceMetrics } from './snapshot/metrics.js'
import { object, sanitized } from './validation.js'
import { publicEndpoint } from './snapshot/snapshot.js'
import { readWorkspaceSetup, saveWorkspaceSetup } from './snapshot/state.js'
import { verifyWorkload } from './snapshot/readiness.js'
import { callPublic } from './snapshot/public-api.js'
import { engineSettingsSchema, workspaceConfig, updateWorkspaceConfig } from './settings.js'
import { workspaceLogs } from './workspace-logs.js'
import { NOT_CORE } from './not-core.js'
import { apiDownloadWait } from '../workspace-view/index.js'
import { startApi } from '../terminal-service/index.js'
import { SerialWork } from './serial.js'

const agentWrites = new SerialWork()
const agentCatalog = CONNECTION_AGENTS.flatMap(({ id }) => {
  const agent = coreAgent(id)
  return agent ? [{ id, name: agent.name, bins: [agent.detectBin], docs: agent.docsUrl }] : []
})

export interface ServerParts {
  restoreSelection?: () => Promise<boolean>
  options: WorkspaceServiceOptions
  keys: ClientKeys
  metrics: Pick<WorkspaceMetrics, 'setDetailed'>
  request: typeof fetch
  snapshot: () => Promise<Pick<WorkspaceSnapshot, 'api' | 'services'> & Partial<WorkspaceSnapshot>>
}

export async function serverOperation(
  { options, keys, metrics, request, snapshot: readSnapshot, restoreSelection }: ServerParts,
  operation: string,
  input: WorkspaceInput
) {
  const { link, paths, config } = options
  switch (operation) {
    case 'settings.schema':
      return engineSettingsSchema(String(input['provider']))
    case 'config.get':
      return {
        ...workspaceConfig(config),
        command_prefix: commandPrefix(options),
      }
    case 'config.update':
      return updateWorkspaceConfig(paths, config, object(input['values']))
    case 'operations.list':
      return WORKSPACE_OPERATIONS
    case 'api.start':
    case 'api.restart': {
      if (operation === 'api.restart') await link.server.stop()
      if (input['restore_selected'] === true) await restoreSelection?.()
      const status = operation === 'api.start' ? (await readSnapshot()).api : undefined
      const started = await startApi(link, config, await keys.get(), {
        request: object(input['request']),
        ...(options.probePort ? { probePort: options.probePort } : {}),
        ...(status ? { status } : {}),
      })
      return sanitized(started)
    }
    case 'api.inspector': {
      const result = await link.request('PUT', '/server/inspector', { enabled: input['enabled'] })
      metrics.setDetailed(input['enabled'] === true)
      return result
    }
    case 'api.stop':
      return sanitized(await link.server.stop())
    case 'api.ping': {
      const ping = await callPublic(link, config, keys, request, '/models')
      return { ok: true, latency_ms: ping.latency_ms, models: ping.result }
    }
    case 'connection.info':
      return {
        ...publicEndpoint(object(await link.server.status()), config),
        keys: await keys.list(),
        agents: agentCatalog,
        configurable_agents: options.agentHost ? agentCatalog.map(({ id }) => id) : [],
      }
    case 'connection.agents':
      return agentCatalog
    case 'connection.configure':
    case 'connection.profile': {
      const agent = String(input['agent']),
        model = String(input['model']),
        state = await link.server.status(),
        base = publicEndpoint(object(state), config).endpoint,
        key = await keys.get(input['key_id'] as string | undefined)
      if (!state.running) throw new AtcError('ATC_USAGE', 'Start the API before connecting an agent.')
      if (!key) throw new AtcError('ATC_USAGE', 'Select an existing API key.')
      if (!(await link.models.sessions()).some((s) => s.model_id === model))
        throw new AtcError('ATC_USAGE', 'Load the selected chat model before connecting an agent.')
      // A list that cannot be read leaves the window unknown; the agent is only not told it.
      const context_length = servedWindow(
        await callPublic(link, config, keys, request, '/models').then(
          ({ result }) => result,
          () => undefined
        ),
        model
      )
      const launch_command = `${commandPrefix(options)} connect ${shellWord(agent)} --model ${shellWord(model)}${input['key_id'] ? ` --key-id ${shellWord(String(input['key_id']))}` : ''}`
      if (operation === 'connection.configure') {
        const host = options.agentHost
        if (!host) throw new AtcError('ATC_USAGE', 'Agent configuration is unavailable on this host.')
        const result = await agentWrites.run('agent-config', () =>
          configureCoreAgent(agent, base, model, key, host, context_length)
        )
        return 'reason' in result
          ? { configured: false, reason: result.reason }
          : { configured: true, launch_command }
      }
      const legacy = AGENTS.find((a) => a.id === agent)
      if (!legacy) throw new AtcError('ATC_USAGE', 'This agent does not have an isolated launch profile.')
      checkAgentWindow(legacy.name, model, context_length)
      return {
        agent,
        endpoint: base,
        model,
        context_length: context_length ?? null,
        profile: agentProfile(
          legacy.id,
          base,
          model,
          key,
          join(paths.atcDir, 'agents', agent),
          1,
          context_length
        ),
        launch_command,
      }
    }
    case 'keys.list':
      return keys.list()
    case 'keys.create':
      return keys.create(String(input['name']))
    case 'keys.reveal': {
      const key = await keys.get(input['id'] as string | undefined)
      if (!key) throw new AtcError('ATC_USAGE', 'No such API key.')
      return { key }
    }
    case 'keys.revoke':
      if (!(await keys.list()).some((k) => k.id === input['id']))
        throw new AtcError('ATC_USAGE', 'No such API key.')
      await keys.revoke(String(input['id']))
      return { revoked: true }
    case 'setup.manual': {
      if (
        input['restore_selected'] !== false &&
        !(await readWorkspaceSetup(paths))?.complete &&
        !apiDownloadWait(await readSnapshot()) &&
        (await restoreSelection?.())
      )
        await startApi(link, config, await keys.get(), {
          status: await link.server.status(),
          ...(options.probePort ? { probePort: options.probePort } : {}),
        })
      return saveWorkspaceSetup(paths, 'manual')
    }
    case 'setup.complete': {
      const snapshot = await readSnapshot()
      if (
        !snapshot.api.running ||
        !snapshot.services.some((s) => ['ready', 'running', 'loaded'].includes(s.state))
      )
        throw new AtcError(
          'ATC_USAGE',
          'Start the API and load a model before finishing guided setup. Set up manually skips this check.'
        )
      const selected = snapshot.services.filter(
        (s) =>
          (!input['model_id'] || s.model === input['model_id']) &&
          (!input['service_id'] || s.id === input['service_id'])
      )
      await verifyWorkload(link, config, keys, request, selected)
      return saveWorkspaceSetup(paths, 'guided')
    }
    case 'logs.read':
      return workspaceLogs(paths.daemonLog, Number(input['lines'] ?? 150))
  }
  return NOT_CORE
}

/** How a person runs this server's atc from a shell: its own executable and data folder, quoted. */
function commandPrefix({ selfCommand, paths }: WorkspaceServiceOptions) {
  return `${(selfCommand ?? ['atc']).map(shellWord).join(' ')} --data-folder ${shellWord(paths.dataFolder)}`
}

function shellWord(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`
}
