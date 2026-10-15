/**
 * What every admin request must pass before a handler sees it, in the control server's style:
 * a loopback peer, a loopback `Host` (DNS rebinding), and for anything that changes state the
 * `X-Atc-Admin` header plus an `Origin` that is our own — a cross-site form or fetch has neither.
 */

import type { IncomingMessage } from 'node:http'
import { ADMIN_HEADER } from '../contract/index.js'

export const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1' ||
    address.startsWith('127.')
  )
}

export function hostNameOf(hostHeader: string | undefined): string {
  if (!hostHeader) return ''
  const h = hostHeader.trim()
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1).toLowerCase()
  return h.split(':')[0]?.toLowerCase() ?? ''
}

export function isLoopbackHost(hostHeader: string | undefined): boolean {
  return LOOPBACK_HOSTS.has(hostNameOf(hostHeader))
}

export const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export interface GateVerdict {
  ok: boolean
  status: number
  reason?: string
}

export function gateRequest(
  req: Pick<IncomingMessage, 'method' | 'headers' | 'socket'>,
  options: { loopbackOnly: boolean }
): GateVerdict {
  const peer = req.socket?.remoteAddress
  if (options.loopbackOnly && !isLoopbackAddress(peer))
    return { ok: false, status: 403, reason: 'admin is loopback-only' }
  if (options.loopbackOnly && !isLoopbackHost(req.headers.host))
    return { ok: false, status: 421, reason: 'unexpected Host' }
  if (MUTATING.has(req.method ?? '')) {
    if (req.headers[ADMIN_HEADER] !== '1')
      return { ok: false, status: 403, reason: `missing ${ADMIN_HEADER} header` }
    const origin = req.headers.origin
    if (typeof origin === 'string' && origin !== 'null') {
      let originHost: string
      try {
        originHost = new URL(origin).host.toLowerCase()
      } catch {
        return { ok: false, status: 403, reason: 'bad Origin' }
      }
      if (originHost !== (req.headers.host ?? '').toLowerCase())
        return { ok: false, status: 403, reason: 'cross-origin request' }
    }
  }
  return { ok: true, status: 200 }
}
