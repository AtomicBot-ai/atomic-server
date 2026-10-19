// Lifted from atomic-chat-core/src/downloads/proxy-fetch.ts @ 8a38521 (v0.17.0); adapted: split into proxy-fetch.ts, proxy-tunnel.ts and http1.ts for the 300-line limit; this file holds the tunnels: TCP, TLS, HTTP CONNECT and SOCKS5.
/** Sockets to an origin through a proxy (HTTP CONNECT, SOCKS5) and the TLS upgrade, for `proxy-fetch.ts`. */

import { connect as netConnect, isIP } from 'node:net'
import type { Socket } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import type { ConnectionOptions } from 'node:tls'
import type { ProxyConfig } from './protocol.js'
import { abortError, ProxyTunnelError, readHead } from './http1.js'

export interface ProxyPolicy {
  proxy?: ProxyConfig | null
  /** Accept any server certificate (the app's `ignore_ssl`); falls back to `proxy.ignore_ssl`. */
  ignore_ssl?: boolean | null | undefined
  /** Extra trusted CA certificates, PEM. Not exposed by the app today; kept for tests and future policy. */
  ca?: string | Buffer | Array<string | Buffer> | undefined
  /**
   * Dial this address instead of resolving the URL's host, while the TLS server name, certificate
   * verification and `Host` stay the URL's — reqwest's `resolve`. It is how the remote-access probe
   * reaches a new tunnel through Cloudflare's edge before its name resolves anywhere. Ignored when a
   * proxy carries the request: the proxy does the dialling then.
   */
  connectTo?: { host: string; port?: number | undefined } | undefined
}

export const PROXY_CONNECT_TIMEOUT_MS = 30_000

export function isHttpProxy(proxy: ProxyConfig): boolean {
  const scheme = new URL(proxy.url).protocol
  return scheme === 'http:' || scheme === 'https:'
}

export function proxyAuthorization(proxy: ProxyConfig): string | undefined {
  const url = new URL(proxy.url)
  const user = proxy.username ?? (url.username ? decodeURIComponent(url.username) : '')
  const pass = proxy.password ?? (url.password ? decodeURIComponent(url.password) : '')
  return user ? `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` : undefined
}

export function connectTcp(host: string, port: number, signal: AbortSignal | null = null): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = netConnect(port, host)
    let settled = false
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      const error = abortError()
      socket.destroy()
      reject(error)
    }
    const timer = setTimeout(
      () => socket.destroy(new ProxyTunnelError(`connect ${host}:${port} timed out`)),
      PROXY_CONNECT_TIMEOUT_MS
    )
    if (signal?.aborted) return onAbort()
    signal?.addEventListener('abort', onAbort, { once: true })
    socket.once('connect', () => {
      if (settled) return
      settled = true
      cleanup()
      resolve(socket)
    })
    socket.once('error', (e) => {
      if (settled) return
      settled = true
      cleanup()
      reject(e)
    })
  })
}

export async function connectToProxy(
  proxy: ProxyConfig,
  policy: ProxyPolicy,
  signal: AbortSignal | null
): Promise<Socket> {
  const url = new URL(proxy.url)
  const port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80)
  const socket = await connectTcp(url.hostname, port, signal)
  return url.protocol === 'https:' ? upgradeTls(socket, url.hostname, policy, signal) : socket
}

/** A raw socket connected to `host:port` through the proxy, ready for the request (or a TLS upgrade). */
export async function tunnel(
  proxy: ProxyConfig,
  host: string,
  port: number,
  policy: ProxyPolicy,
  signal: AbortSignal | null = null
): Promise<Socket> {
  const scheme = new URL(proxy.url).protocol
  if (scheme === 'http:' || scheme === 'https:')
    return connectViaHttpConnect(proxy, host, port, policy, signal)
  if (scheme === 'socks5:' || scheme === 'socks5h:') return connectViaSocks5(proxy, host, port, signal)
  if (scheme === 'socks4:') throw new ProxyTunnelError('socks4 proxies are not supported')
  throw new ProxyTunnelError(`unsupported proxy scheme ${scheme}`)
}

async function connectViaHttpConnect(
  proxy: ProxyConfig,
  host: string,
  port: number,
  policy: ProxyPolicy,
  signal: AbortSignal | null
): Promise<Socket> {
  const socket = await connectToProxy(proxy, policy, signal)
  const auth = proxyAuthorization(proxy)
  socket.write(
    `CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth ? `Proxy-Authorization: ${auth}\r\n` : ''}\r\n`
  )
  const { status, rest } = await readHead(socket, signal).catch((e: Error) => {
    socket.destroy()
    if (e.name === 'AbortError') throw e
    throw new ProxyTunnelError(`CONNECT ${host}:${port} via ${new URL(proxy.url).host} failed: ${e.message}`)
  })
  if (status !== 200) {
    socket.destroy()
    throw new ProxyTunnelError(`CONNECT ${host}:${port} via ${new URL(proxy.url).host} -> HTTP ${status}`)
  }
  if (rest.length) socket.unshift(rest)
  return socket
}

/** RFC 1928 CONNECT with domain-name address type; RFC 1929 user/pass when credentials exist. */
async function connectViaSocks5(
  proxy: ProxyConfig,
  host: string,
  port: number,
  signal: AbortSignal | null
): Promise<Socket> {
  const url = new URL(proxy.url)
  const user = proxy.username ?? (url.username ? decodeURIComponent(url.username) : '')
  const pass = proxy.password ?? (url.password ? decodeURIComponent(url.password) : '')
  const socket = await connectTcp(url.hostname, Number(url.port) || 1080, signal)
  const reader = new SocketReader(socket, signal)
  const fail = (msg: string): never => {
    reader.detach()
    socket.destroy()
    throw new ProxyTunnelError(`socks5 via ${url.host}: ${msg}`)
  }
  const read = (count: number) =>
    reader.read(count).catch((error: Error) => {
      if (error.name === 'AbortError') throw error
      return fail(error.message)
    })
  socket.write(Buffer.from(user ? [5, 2, 0, 2] : [5, 1, 0]))
  const greeting = await read(2)
  if (greeting[0] !== 5) fail('bad version')
  if (greeting[1] === 0xff) fail('no acceptable auth method')
  if (greeting[1] === 2) {
    const u = Buffer.from(user)
    const p = Buffer.from(pass)
    socket.write(Buffer.concat([Buffer.from([1, u.length]), u, Buffer.from([p.length]), p]))
    const reply = await read(2)
    if (reply[1] !== 0) fail('authentication failed')
  } else if (greeting[1] !== 0) fail(`unexpected auth method ${greeting[1]}`)
  const h = Buffer.from(host)
  socket.write(Buffer.concat([Buffer.from([5, 1, 0, 3, h.length]), h, Buffer.from([port >> 8, port & 0xff])]))
  const reply = await read(4)
  if (reply[1] !== 0) fail(`connect rejected (rep=${reply[1]})`)
  const atyp = reply[3]
  if (atyp === 1) await read(4 + 2)
  else if (atyp === 3) {
    const [len] = await read(1)
    await read((len as number) + 2)
  } else if (atyp === 4) await read(16 + 2)
  else fail('bad address type in reply')
  const rest = reader.detach()
  if (rest.length) socket.unshift(rest)
  return socket
}

export function upgradeTls(
  socket: Socket,
  servername: string,
  policy: ProxyPolicy,
  signal: AbortSignal | null
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const options: ConnectionOptions = { socket }
    if (!isIP(servername)) options.servername = servername
    if (policy.ignore_ssl ?? policy.proxy?.ignore_ssl) options.rejectUnauthorized = false
    if (policy.ca) options.ca = policy.ca
    const secure = tlsConnect(options)
    let settled = false
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    const onAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      secure.destroy()
      reject(abortError())
    }
    if (signal?.aborted) return onAbort()
    signal?.addEventListener('abort', onAbort, { once: true })
    secure.once('secureConnect', () => {
      if (settled) return
      settled = true
      cleanup()
      resolve(secure)
    })
    secure.once('error', (e) => {
      if (settled) return
      settled = true
      cleanup()
      socket.destroy()
      reject(e)
    })
  })
}

/** Byte-exact reads from a socket while a handshake is in progress. */
class SocketReader {
  private buf = Buffer.alloc(0)
  private want: { n: number; resolve: (b: Buffer) => void; reject: (e: Error) => void } | null = null
  private readonly onData = (chunk: Buffer) => {
    this.buf = Buffer.concat([this.buf, chunk])
    this.pump()
  }
  private ended: Error | undefined
  private readonly onEnd = () => {
    this.ended ??= new Error('connection closed during handshake')
    this.want?.reject(this.ended)
    this.want = null
  }
  private readonly onAbort = () => {
    this.ended = abortError()
    this.want?.reject(this.ended)
    this.want = null
    this.socket.destroy()
  }
  constructor(
    private readonly socket: Socket,
    private readonly signal: AbortSignal | null
  ) {
    socket.on('data', this.onData)
    socket.once('end', this.onEnd)
    socket.once('error', this.onEnd)
    if (signal?.aborted) this.onAbort()
    else signal?.addEventListener('abort', this.onAbort, { once: true })
  }
  read(n: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (this.ended) return reject(this.ended)
      this.want = { n, resolve, reject }
      this.pump()
    })
  }
  private pump() {
    if (this.want && this.buf.length >= this.want.n) {
      const out = this.buf.subarray(0, this.want.n)
      this.buf = this.buf.subarray(this.want.n)
      const { resolve } = this.want
      this.want = null
      resolve(out)
    }
  }
  /** Stop reading and hand back any bytes that arrived after the handshake. */
  detach(): Buffer {
    this.socket.off('data', this.onData)
    this.socket.off('end', this.onEnd)
    this.socket.off('error', this.onEnd)
    this.signal?.removeEventListener('abort', this.onAbort)
    return this.buf
  }
}
