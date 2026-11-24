/**
 * The account service as the workspace runs it: reachability read from the core, and "bring up" — the public
 * API and the tunnel — through the workspace's own operations, so sharing starts them the way a person would.
 */
import type { RemoteAccessStatus } from '@atomic-chat/core/contracts'
import { AccountService, type ReachabilityInput } from '../account/index.js'
import { AtcError } from '../errors/index.js'
import type { WorkspaceInput } from '../contract/index.js'
import type { WorkspaceServiceOptions } from './service-options.js'

const ALL_INTERFACES = new Set(['0.0.0.0', '::', '[::]'])

async function readReachability(options: WorkspaceServiceOptions): Promise<ReachabilityInput> {
  const { link } = options
  const [tunnel, server] = await Promise.all([
    link.request<RemoteAccessStatus>('GET', '/remote-access').catch(() => null),
    link.server.status().catch(() => null),
  ])
  const lanAddresses =
    server?.running && ALL_INTERFACES.has(server.host)
      ? await link
          .request<{ addresses?: unknown }>('GET', '/lan-addresses')
          .then((r) => (Array.isArray(r.addresses) ? r.addresses.filter((a) => typeof a === 'string') : []))
          .catch(() => [])
      : []
  return { tunnel, server, lanAddresses }
}

/** Start the API when it is stopped, then the tunnel; refuse when neither the tunnel nor the LAN can work. */
async function bringUp(
  options: WorkspaceServiceOptions,
  execute: (operation: string, input?: WorkspaceInput) => Promise<unknown>
): Promise<void> {
  const { link } = options
  if (!(await link.server.status()).running) await execute('api.start')
  const lan = ALL_INTERFACES.has((await link.server.status()).host)
  let tunnel = await link.request<RemoteAccessStatus>('GET', '/remote-access')
  if (tunnel.state === 'off' || tunnel.state === 'error')
    tunnel = await link.request<RemoteAccessStatus>('POST', '/remote-access/start').catch(() => tunnel)
  if (tunnel.state !== 'error' || lan) return
  const setup = options.remoteSetup
  throw new AtcError(
    'ATC_REMOTE_UNREACHABLE',
    'Devices cannot reach this server: the tunnel did not start.',
    {
      hint: setup?.commands.length
        ? `Install cloudflared (${setup.commands.at(-1)}) and run ${setup.restart}, or listen on the network: atc config set api.host 0.0.0.0, then atc api restart.`
        : 'Install cloudflared and restart the server, or listen on the network: atc config set api.host 0.0.0.0, then atc api restart.',
    }
  )
}

export function workspaceAccount(
  options: WorkspaceServiceOptions,
  execute: (operation: string, input?: WorkspaceInput) => Promise<unknown>,
  log: { info(message: string): void; warn(message: string): void } = { info: () => {}, warn: () => {} }
): AccountService {
  return new AccountService({
    atcDir: options.paths.atcDir,
    fetch: options.fetch ?? fetch,
    ...(options.env ? { env: options.env } : {}),
    ...(options.platform ? { platform: options.platform } : {}),
    enabled: () => options.config.account?.enabled === true,
    reachability: () => readReachability(options),
    bringUp: () => bringUp(options, execute),
    log,
  })
}
