// Lifted from atomic-chat-core/src/downloads/proxy-fetch.ts @ 8a38521 (v0.17.0); adapted: split into proxy-fetch.ts, proxy-tunnel.ts and http1.ts for the 300-line limit; this file holds the fetch-shaped client and its redirects.
/**
 * `fetch` for downloads that carry a proxy policy. A dependency-free HTTP/1.1 client over
 * `node:net`/`node:tls` that establishes the tunnel itself (HTTP forward, CONNECT, SOCKS5 with
 * RFC 1929 auth) and applies the TLS policy via `tls.connect`. Chosen over `undici`/agent overrides
 * because it behaves identically on Node, Bun and the compiled binary — see
 * docs/decisions/2026-09-15-proxied-downloads-use-a-raw-socket-client.md.
 *
 * Scope: what the downloader needs. GET/HEAD, status + headers, `Content-Length`/chunked/
 * close-delimited bodies as a `ReadableStream` with backpressure, `AbortSignal`, fetch-shaped
 * redirects (each hop re-evaluates `no_proxy` and opens a fresh tunnel). One connection per request,
 * no content encoding. Downloads without a proxy never come here; the remote-access probe does, for
 * `connectTo` and because it must behave the same under Node, Bun and the compiled binary.
 */

import { shouldBypassProxy } from './protocol.js'
import type { ProxyConfig } from './protocol.js'
import { abortError, bodyStream, readHead } from './http1.js'
import {
  connectTcp,
  connectToProxy,
  isHttpProxy,
  proxyAuthorization,
  tunnel,
  upgradeTls,
} from './proxy-tunnel.js'
import type { ProxyPolicy } from './proxy-tunnel.js'
import type { Socket } from 'node:net'
export { ProxyTunnelError } from './http1.js'
export { PROXY_CONNECT_TIMEOUT_MS, proxyAuthorization, tunnel } from './proxy-tunnel.js'
export type { ProxyPolicy } from './proxy-tunnel.js'

export const MAX_REDIRECTS = 10

type PlainHeaders = Record<string, string>
type RequestBody = NonNullable<RequestInit['body']>
type RequestHeaders = NonNullable<RequestInit['headers']>

/** Default `fetchFor` of the downloader: items with a proxy get the policy fetch, others the base. */
export function policyFetchFor(item: { proxy?: ProxyConfig | null }, base: typeof fetch): typeof fetch {
  if (!item.proxy) return base
  return createPolicyFetch({ proxy: item.proxy, ignore_ssl: item.proxy.ignore_ssl })
}

export function createPolicyFetch(policy: ProxyPolicy): typeof fetch {
  const once = async (url: URL, init: RequestInit & { headers?: PlainHeaders }): Promise<Response> => {
    const signal = init.signal ?? null
    throwIfAborted(signal)
    const proxy = policy.proxy ?? null
    const useProxy = proxy !== null && !shouldBypassProxy(url.href, proxy.no_proxy ?? [])
    const isHttps = url.protocol === 'https:'
    if (!isHttps && url.protocol !== 'http:') throw new TypeError(`unsupported URL scheme ${url.protocol}`)
    const port = Number(url.port) || (isHttps ? 443 : 80)
    const method = (init.method ?? 'GET').toUpperCase()
    const headers: PlainHeaders = { host: url.host }
    for (const [k, v] of Object.entries(init.headers ?? {})) headers[k.toLowerCase()] = v
    headers['connection'] = 'close'

    let socket: Socket
    let requestTarget = url.pathname + url.search
    if (useProxy && !isHttps && isHttpProxy(proxy)) {
      // plain HTTP through an HTTP proxy: absolute-form request line, no tunnel
      socket = await connectToProxy(proxy, policy, signal)
      requestTarget = url.href
      const auth = proxyAuthorization(proxy)
      if (auth) headers['proxy-authorization'] = auth
    } else {
      socket = useProxy
        ? await tunnel(proxy, url.hostname, port, policy, signal)
        : await connectTcp(policy.connectTo?.host ?? url.hostname, policy.connectTo?.port ?? port, signal)
      if (isHttps) socket = await upgradeTls(socket, url.hostname, policy, signal)
    }

    const onAbort = () => socket.destroy(abortError())
    if (signal?.aborted) onAbort()
    signal?.addEventListener('abort', onAbort, { once: true })
    socket.once('close', () => signal?.removeEventListener('abort', onAbort))

    const head =
      `${method} ${requestTarget} HTTP/1.1\r\n` +
      Object.entries(headers)
        .map(([k, v]) => `${k}: ${v}\r\n`)
        .join('') +
      '\r\n'
    socket.write(head)
    if (init.body !== undefined && init.body !== null) socket.write(await bodyBytes(init.body))

    const { status, statusText, headers: responseHeaders, rest } = await readHead(socket, signal)
    const body = bodyStream(socket, rest, responseHeaders, method, status)
    return new Response(body, { status, statusText, headers: responseHeaders })
  }

  return async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const request = input instanceof Request ? input : null
    let url = new URL(request ? request.url : String(input))
    let method = init.method ?? request?.method ?? 'GET'
    let body: RequestBody | null = init.body ?? null
    const headers = headersToPlain(init.headers ?? request?.headers)
    const signal = init.signal ?? request?.signal ?? null
    for (let hop = 0; ; hop++) {
      const res = await once(url, { method, body, headers, signal })
      const location = res.headers.get('location')
      if (![301, 302, 303, 307, 308].includes(res.status) || location === null || init.redirect === 'manual')
        return res
      if (init.redirect === 'error') throw new TypeError('redirect not allowed')
      if (hop >= MAX_REDIRECTS) throw new TypeError('too many redirects')
      await res.body?.cancel()
      const next = new URL(location, url)
      if (url.origin !== next.origin) {
        for (const k of Object.keys(headers))
          if (/^(authorization|proxy-authorization|cookie)$/i.test(k)) delete headers[k]
      }
      if (
        res.status === 303 ||
        ((res.status === 301 || res.status === 302) && method.toUpperCase() === 'POST')
      ) {
        method = 'GET'
        body = null
      }
      url = next
    }
  }
}

function throwIfAborted(signal: AbortSignal | null): void {
  if (signal?.aborted) throw abortError()
}

function headersToPlain(headers: RequestHeaders | undefined): PlainHeaders {
  const out: PlainHeaders = {}
  if (!headers) return out
  if (headers instanceof Headers) headers.forEach((v, k) => (out[k] = v))
  else if (Array.isArray(headers)) for (const pair of headers) out[String(pair[0])] = String(pair[1])
  else for (const [k, v] of Object.entries(headers)) out[k] = String(v)
  return out
}

async function bodyBytes(body: RequestBody): Promise<Buffer> {
  if (typeof body === 'string') return Buffer.from(body)
  if (body instanceof ArrayBuffer) return Buffer.from(body)
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength)
  return Buffer.from(await new Response(body).arrayBuffer())
}
