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

function lanHost(address: string): string | null {
  const value = address.trim()
  if (!value || value.startsWith('127.') || value === '::1') return null
  return value.includes(':') ? `[${value.replace(/^\[|\]$/g, '')}]` : value
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
