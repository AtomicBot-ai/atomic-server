import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ExecFn } from '../host/index.js'
import { AGENTS, agentProfile } from './plan.js'
import type { AgentId, AgentLaunch } from './plan.js'
export interface AgentHost {
  env: NodeJS.ProcessEnv
  cwd: string
  folder: string
  find: (name: string) => string | undefined
  exec: ExecFn
}
/** Profiles live inside this server's data folder; existing agent settings are never rewritten. */
export async function prepareAgent(
  id: AgentId,
  endpoint: string,
  model: string,
  key: string,
  host: AgentHost
): Promise<AgentLaunch> {
  const agent = AGENTS.find((a) => a.id === id)
  if (!agent) throw new Error('Unknown agent.')
  const command = agent.bins.map((b) => host.find(b)).find(Boolean)
  if (!command) throw new Error(`${agent.name} is not installed on PATH. Install it from ${agent.docs}`)
  let major = 1
  if (id === 'opencode') {
    const version = await host.exec(command, ['--version'], { timeoutMs: 5000, env: host.env })
    const match = version.stdout.match(/(?:^|\s)v?(\d+)\.\d+/)
    if (version.code !== 0 || !match)
      throw new Error('Could not detect the OpenCode version. Run opencode --version and retry.')
    major = Number(match[1])
    if (major > 2) throw new Error('This OpenCode version needs an updated connection adapter.')
  }
  const folder = join(host.folder, id)
  const profile = agentProfile(id, endpoint, model, key, folder, major)
  if (profile.config || id === 'claude') await mkdir(folder, { recursive: true, mode: 0o700 })
  if (profile.config) {
    const path = join(folder, id === 'opencode' ? 'opencode.json' : 'config.json')
    let previous: Record<string, unknown> = {}
    try {
      previous = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('The saved agent profile is invalid. Repair it before reconnecting.')
    }
    await writeFile(path, JSON.stringify({ ...previous, ...profile.config }, null, 2) + '\n', { mode: 0o600 })
  }
  const launch: AgentLaunch = {
    command,
    args: profile.args,
    env: { ...host.env, ...profile.env },
    cwd: id === 'opencode' && major >= 2 ? folder : host.cwd,
  }
  if (id === 'claude') {
    // --settings outranks an existing settings.json env block. Remove this secret file on return.
    const temp = await mkdtemp(join(folder, 'session-')),
      path = join(temp, 'settings.json')
    await writeFile(path, JSON.stringify({ env: profile.env }), { mode: 0o600 })
    launch.args.push('--settings', path)
    launch.cleanup = () => rm(temp, { recursive: true, force: true })
  }
  return launch
}
