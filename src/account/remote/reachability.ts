/**
 * Where devices can reach this server's public API now: the tunnel while it is online, then each LAN address
 * while the API listens on every interface. Pure; the host reads the inputs from the core.
 */
import { isDialableUrl, type Endpoint } from './sealed.js'
import type { TunnelState } from './remote-api.js'

export interface ReachabilityInput {
  tunnel: { state: string; url: string | null } | null
  server: { running: boolean; host: string; port: number; prefix: string } | null
  lanAddresses: readonly string[]
}

export interface Reachability {
  tunnel: TunnelState
  lan: boolean
  endpoints: Endpoint[]
}

/** The tunnel as the backend wants it: starting and stopping count as off; only a failure is `error`. */
export function tunnelState(state: string | undefined): TunnelState {
  return state === 'online' ? 'online' : state === 'error' ? 'error' : 'off'
}

/** `/v1`, `/v1/`, `v1` → `/v1`; empty stays empty. */
function cleanPrefix(prefix: string): string {
  const trimmed = prefix.trim().replace(/\/+$/, '')
  return !trimmed ? '' : trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

const ALL_INTERFACES = new Set(['0.0.0.0', '::', '[::]'])

/**
 * Addresses no other device can dial: loopback, link-local (`169.254/16`, `fe80::/10`, which would also
 * need this machine's zone id) and `198.18/15`, the range VPN and proxy apps give their own tunnel
 * interface (fake-IP TUN). Offering them would only make a device wait on a dead address first.
 */
const UNDIALABLE = /^(127\.|169\.254\.|198\.1[89]\.|::1$|fe[89ab][0-9a-f]:)/i

function lanHost(address: string): string | null {
  const value = address.trim().replace(/^\[|\]$/g, '')
  if (!value || UNDIALABLE.test(value)) return null
  return value.includes(':') ? `[${value}]` : value
}

export function reachability(input: ReachabilityInput): Reachability {
  const server = input.server
  const prefix = cleanPrefix(server?.prefix ?? '/v1')
  const tunnel = tunnelState(input.tunnel?.state)
  const endpoints: Endpoint[] = []
  if (server?.running && tunnel === 'online' && input.tunnel?.url)
    endpoints.push({ kind: 'tunnel', url: `${input.tunnel.url.replace(/\/+$/, '')}${prefix}` })
  const lan = Boolean(server?.running && ALL_INTERFACES.has(server.host))
  if (lan && server)
    for (const address of input.lanAddresses) {
      const host = lanHost(address)
      if (host) endpoints.push({ kind: 'lan', url: `http://${host}:${server.port}${prefix}` })
    }
  // Only what a device may dial: an odd address from the core is dropped here, not published.
  return { tunnel, lan, endpoints: endpoints.filter((e) => isDialableUrl(e.url)) }
}

/** Same addresses in the same order: no new blobs are needed. */
export const sameEndpoints = (a: readonly Endpoint[], b: readonly Endpoint[]): boolean =>
  a.length === b.length && a.every((e, i) => e.kind === b[i]?.kind && e.url === b[i]?.url)
