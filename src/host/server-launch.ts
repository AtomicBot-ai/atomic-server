/**
 * How the running server was started, from facts its own process can see: systemd sets
 * `INVOCATION_ID` for every unit, and a `systemd --user` unit sits under `user@<uid>.service` in
 * `/proc/self/cgroup`; launchd names its job in `XPC_SERVICE_NAME` (Terminal.app sets `0`). Anything
 * else — `atc start`, `start --foreground` in a shell, a Windows task — counts as a terminal.
 */

import { readFile } from 'node:fs/promises'
import type { ServerLaunch } from '../contract/index.js'

export function serverLaunch(facts: {
  platform: NodeJS.Platform | string
  env: Record<string, string | undefined>
  /** `/proc/self/cgroup`, when it could be read. */
  cgroup?: string | undefined
}): ServerLaunch {
  if (facts.platform === 'linux' && facts.env['INVOCATION_ID'])
    return facts.cgroup && /\/user@\d+\.service\//.test(facts.cgroup) ? 'systemd-user' : 'systemd-system'
  const job = facts.env['XPC_SERVICE_NAME']
  if (facts.platform === 'darwin' && job && job !== '0') return 'launchd'
  return 'terminal'
}

/**
 * The systemd unit the process runs in, without `.service` (`atc service install --name` sets it):
 * the last `.service` segment of the cgroup path, never the user manager `user@<uid>.service`.
 */
export function serviceUnit(cgroup: string | undefined): string | undefined {
  // cgroup v2 has one line `0::<path>`; v1 names systemd's own hierarchy `<n>:name=systemd:<path>`.
  const lines = cgroup?.split('\n') ?? []
  const line = lines.find((l) => l.startsWith('0::')) ?? lines.find((l) => l.includes(':name=systemd:')) ?? ''
  const unit = /\/([^/]+)\.service$/.exec(line.trim())?.[1]
  return unit && !/^user@\d+$/.test(unit) ? unit : undefined
}

/** The running process's own launch and, under systemd, its unit; reads `/proc/self/cgroup` on Linux, best effort. */
export async function readServerLaunch(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>
): Promise<{ launch: ServerLaunch; service?: string }> {
  const cgroup =
    platform === 'linux' ? await readFile('/proc/self/cgroup', 'utf8').catch(() => undefined) : undefined
  const launch = serverLaunch({ platform, env, cgroup })
  const service = launch.startsWith('systemd') ? serviceUnit(cgroup) : undefined
  return { launch, ...(service ? { service } : {}) }
}
