/**
 * The server's `cloudflared`, looked for once at start (`src/host/cloudflared.ts`): its path goes to the
 * core, which runs it for remote access, and how to install one goes to the clients while there is none.
 */

import type { RemoteAccessSetup } from '../contract/index.js'
import { findCloudflared, linuxFamily } from '../host/index.js'
import type { HostServices, LinuxFamily } from '../host/index.js'
import type { AtcIo } from '../io.js'
import type { Logger } from '../output/index.js'
import { readInstallSource } from '../update/index.js'
import type { InstallSource } from '../update/index.js'
import { remoteAccessSetup } from '../workspace-service/index.js'

/** A package names its system outright; the deb and the rpm also install on Debian's and Fedora's kin. */
const PACKAGE_FAMILY: Record<InstallSource, LinuxFamily> = { deb: 'debian', rpm: 'fedora', aur: 'arch' }

export async function serverCloudflared(options: {
  io: AtcIo
  host: HostServices
  log: Logger
}): Promise<{ path: string | undefined; setup: RemoteAccessSetup }> {
  const { io, host, log } = options
  const { platform, homedir } = host.facts
  const path = findCloudflared({ platform, env: io.env, home: homedir })
  log.info(path ? `remote access: cloudflared at ${path}` : 'remote access: no cloudflared on this machine')
  let family: LinuxFamily | null = null
  if (platform === 'linux') {
    const source = await readInstallSource(io.readFile, platform, host.selfCommand[0] ?? process.execPath)
    family = source
      ? PACKAGE_FAMILY[source]
      : linuxFamily((await io.readFile('/etc/os-release').catch(() => undefined)) ?? '')
  }
  return { path, setup: remoteAccessSetup({ platform, family, found: path }) }
}
