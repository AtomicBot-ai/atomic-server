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

/** The running process's own launch; reads `/proc/self/cgroup` on Linux, best effort. */
export async function readServerLaunch(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>
): Promise<ServerLaunch> {
  const cgroup =
    platform === 'linux' ? await readFile('/proc/self/cgroup', 'utf8').catch(() => undefined) : undefined
  return serverLaunch({ platform, env, cgroup })
}
