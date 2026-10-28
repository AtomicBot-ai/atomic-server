import type { RemoteAccessSetup } from '../contract/index.js'
import type { LinuxFamily } from '../host/index.js'

const DOWNLOADS =
  'https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/'
const PACKAGES = 'https://pkg.cloudflare.com/index.html'
const RELEASES = 'https://github.com/cloudflare/cloudflared/releases/latest'

/** Debian and Ubuntu have no cloudflared of their own: Cloudflare's apt repository, as pkg.cloudflare.com gives it. */
const APT = [
  'sudo mkdir -p --mode=0755 /usr/share/keyrings',
  'curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null',
  "echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list",
  'sudo apt-get update && sudo apt-get install cloudflared',
]
/** Neither has Fedora nor RHEL: Cloudflare's repository file. */
const DNF = [
  'curl -fsSL https://pkg.cloudflare.com/cloudflared.repo | sudo tee /etc/yum.repos.d/cloudflared.repo',
  'sudo dnf install cloudflared',
]

/** How to install `cloudflared` on the server's machine; `found` is the one it found and could not run. */
export function remoteAccessSetup(input: {
  platform: NodeJS.Platform
  family: LinuxFamily | null
  found: string | undefined
}): RemoteAccessSetup {
  const [commands, url] = installation(input.platform, input.family)
  return { found: input.found ?? null, commands, url, restart: 'atc restart' }
}

function installation(platform: NodeJS.Platform, family: LinuxFamily | null): [string[], string] {
  if (platform === 'darwin') return [['brew install cloudflared'], DOWNLOADS]
  if (platform === 'win32') return [['winget install --id Cloudflare.cloudflared'], DOWNLOADS]
  if (family === 'arch') return [['sudo pacman -S cloudflared'], DOWNLOADS]
  if (family === 'debian') return [APT, PACKAGES]
  if (family === 'fedora') return [DNF, PACKAGES]
  return [[], RELEASES]
}

const REMOTE = new Set(['remote.status', 'remote.start', 'remote.stop'])

/** A remote access answer with `setup` added while the core reports it has no `cloudflared` to run. */
export function withRemoteSetup(operation: string, result: unknown, setup: RemoteAccessSetup | undefined) {
  if (!setup || !REMOTE.has(operation) || typeof result !== 'object' || result === null) return result
  const status = result as Record<string, unknown>
  return status['error'] === 'cloudflared_unavailable' ? { ...status, cloudflared: setup } : result
}
