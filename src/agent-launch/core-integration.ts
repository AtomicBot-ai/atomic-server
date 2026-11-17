import {
  apiUrlFor,
  childEnv,
  configureAgent,
  CONFLICTING_PROVIDER_ENV,
  detectAgent,
  findAgent,
  HERMES_CONTEXT_LENGTH,
  registeredAgents,
  runArgsFor,
} from '@atomic-chat/core/integrations'
import { AtcError } from '../errors/index.js'
import { checkAgentWindow, readServedWindow } from './context-window.js'
import type { AgentLaunch } from './plan.js'
import type { AgentHost } from './prepare.js'
import { spawnTarget } from './spawn-target.js'

export type IntegrationHost = Pick<AgentHost, 'env' | 'platform' | 'find' | 'exec'>
const writers = new Set(registeredAgents())

export function coreAgent(id: string) {
  const agent = findAgent(id)
  return agent && writers.has(agent.id) ? agent : undefined
}

/** Configure the active profile on the host that owns the agent, using the core's writer. */
export async function configureCoreAgent(
  id: string,
  endpoint: string,
  model: string,
  key: string,
  host: IntegrationHost,
  contextLength?: number
) {
  const agent = coreAgent(id)
  if (!agent) throw new AtcError('ATC_USAGE', 'This agent uses manual endpoint setup.')
  const detection = await detectAgent(agent, {
    platform: host.platform,
    env: host.env,
    onPath: async (bin) => Boolean(host.find(bin)),
  })
  if (!detection.installed) return { reason: `${agent.name} was not found on the server host.` } as const
  checkAgentWindow(
    agent.name,
    model,
    contextLength,
    agent.id === 'hermes' ? HERMES_CONTEXT_LENGTH : undefined
  )
  const url = new URL(endpoint)
  const apiPrefix = url.pathname.replace(/\/$/, '')
  const apiUrl = apiUrlFor(agent, url.origin, apiPrefix)
  await configureAgent(agent, apiUrl, model, key, {
    env: host.env,
    platform: host.platform,
    program: detection.path ?? host.find(detection.program) ?? detection.program,
    spawn: async (program, args) => {
      const result = await host.exec(program, args, { env: host.env })
      return { code: result.code ?? 1, stdout: result.stdout, stderr: result.stderr }
    },
    ...(contextLength ? { contextLength } : {}),
  })
  return { agent, detection, apiUrl, apiPrefix } as const
}

export async function prepareCoreAgent(
  id: string,
  endpoint: string,
  model: string,
  key: string,
  host: AgentHost
): Promise<AgentLaunch> {
  const contextLength = await readServedWindow(host.request, endpoint, key, model)
  const result = await configureCoreAgent(id, endpoint, model, key, host, contextLength)
  if ('reason' in result) throw new AtcError('ATC_USAGE', result.reason)
  const { agent, detection, apiUrl, apiPrefix } = result
  const program = detection.path ?? host.find(detection.program) ?? detection.program
  const args = runArgsFor(agent, model, apiUrl)
  const env = { ...host.env }
  for (const name of CONFLICTING_PROVIDER_ENV) delete env[name]
  const target = spawnTarget(program, args, host.platform)
  return {
    command: target.file,
    args: target.args,
    cwd: host.cwd,
    env: {
      ...env,
      ...childEnv(agent, apiUrl, model, key, { apiPrefix, ...(contextLength ? { contextLength } : {}) }),
    },
    ...(target.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
  }
}
