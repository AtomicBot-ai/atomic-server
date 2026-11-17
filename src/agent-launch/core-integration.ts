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
import { AGENTS, type AgentLaunch } from './plan.js'
import type { AgentHost } from './prepare.js'
import { spawnTarget } from './spawn-target.js'

export type IntegrationHost = Pick<AgentHost, 'env' | 'platform' | 'find' | 'exec'>
const writers = new Set(registeredAgents())

export function coreAgent(id: string) {
  const agent = findAgent(id)
  return agent && writers.has(agent.id) ? agent : undefined
}

const legacyAgent = (id: string) => AGENTS.find((agent) => findAgent(agent.id)?.id === id)

/** Configure the active profile on the host that owns the agent, using the core's writer. */
export async function configureCoreAgent(
  id: string,
  endpoint: string,
  model: string,
  key: string,
  host: IntegrationHost,
  context?: number | (() => Promise<number | undefined>)
) {
  const agent = coreAgent(id)
  if (!agent) throw new AtcError('ATC_USAGE', 'This agent uses manual endpoint setup.')
  const onPath = (legacyAgent(agent.id)?.bins ?? [agent.detectBin]).map((bin) => host.find(bin)).find(Boolean)
  const detection = await detectAgent(agent, {
    platform: host.platform,
    env: host.env,
    onPath: async () => Boolean(onPath),
  })
  if (!detection.installed)
    return { agent, reason: `${agent.name} was not found on the server host.` } as const
  const contextLength = typeof context === 'function' ? await context() : context
  checkAgentWindow(
    agent.name,
    model,
    contextLength,
    agent.id === 'hermes' ? HERMES_CONTEXT_LENGTH : undefined
  )
  const url = new URL(endpoint)
  const apiPrefix = url.pathname.replace(/\/$/, '')
  const apiUrl = apiUrlFor(agent, url.origin, apiPrefix)
  const program = detection.path ?? onPath ?? detection.program
  await configureAgent(agent, apiUrl, model, key, {
    env: host.env,
    platform: host.platform,
    program,
    spawn: async (program, args) => {
      const result = await host.exec(program, args, { env: host.env })
      return { code: result.code ?? 1, stdout: result.stdout, stderr: result.stderr }
    },
    ...(contextLength ? { contextLength } : {}),
  })
  return { agent, program, apiUrl, apiPrefix, contextLength } as const
}

export async function prepareCoreAgent(
  id: string,
  endpoint: string,
  model: string,
  key: string,
  host: AgentHost
): Promise<AgentLaunch> {
  const result = await configureCoreAgent(id, endpoint, model, key, host, () =>
    readServedWindow(host.request, endpoint, key, model)
  )
  if ('reason' in result) {
    const legacy = legacyAgent(result.agent.id)
    throw new AtcError(
      'ATC_USAGE',
      `${legacy?.name ?? result.agent.name} is not installed on PATH. Install it from ${legacy?.docs ?? result.agent.docsUrl}`
    )
  }
  const { agent, program, apiUrl, apiPrefix, contextLength } = result
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
