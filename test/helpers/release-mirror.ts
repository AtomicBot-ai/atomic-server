// Lifted from atomic-chat-core/test/helpers/engine-builds-mirror.ts @ 67bc5759 (v0.18.5); adapted: the mirror only, its TLS leaf from test/fixtures/tls.
/**
 * Releases for the core's engine-builds install: an HTTPS origin behind a CONNECT proxy. A manifest
 * names `https://github.com/<repo>/releases/download/…`; the install request carries
 * `proxy: {url, ignore_ssl: true}` (atc's `proxy.*` config), so every host lands on this origin, which
 * serves by path.
 */
import { readFileSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { connect as netConnect } from 'node:net'
import type { Server, Socket } from 'node:net'

export interface ReleaseMirror {
  proxy: { url: string; ignore_ssl: boolean }
  /** Serve `body` at `path` (`/<owner>/<repo>/releases/download/<tag>/<name>`). */
  serve(path: string, body: Buffer): void
  /** `GET <path>` requests seen, in order. */
  seen: string[]
  close(): Promise<void>
}

const tls = (name: string) => readFileSync(new URL(`../fixtures/tls/${name}`, import.meta.url))
const port = (server: Server): number => {
  const address = server.address()
  return typeof address === 'object' && address ? address.port : 0
}
const listen = (server: Server): Promise<void> =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve()))

export async function startReleaseMirror(): Promise<ReleaseMirror> {
  const files = new Map<string, Buffer>()
  const seen: string[] = []
  const origin = createHttpsServer(
    { key: tls('selfsigned.key'), cert: tls('selfsigned.pem') },
    (req, res) => {
      const path = req.url ?? '/'
      const body = files.get(path)
      if (!body) return res.writeHead(404).end('not found')
      if (req.method === 'GET') seen.push(path)
      res.writeHead(200, { 'content-length': body.length, 'content-type': 'application/octet-stream' })
      return req.method === 'HEAD' ? res.end() : res.end(body)
    }
  )
  const proxy = createHttpServer()
  proxy.on('connect', (_req, socket: Socket, head: Buffer) => {
    const upstream = netConnect(port(origin), '127.0.0.1', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length) upstream.write(head)
      socket.pipe(upstream)
      upstream.pipe(socket)
    })
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
  })
  await Promise.all([listen(origin), listen(proxy)])
  const sockets = new Set<Socket>()
  for (const server of [origin, proxy])
    server.on('connection', (socket: Socket) => {
      sockets.add(socket)
      socket.once('close', () => sockets.delete(socket))
    })
  return {
    proxy: { url: `http://127.0.0.1:${port(proxy)}`, ignore_ssl: true },
    serve: (path, body) => files.set(path, body),
    seen,
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await Promise.all([origin, proxy].map((s) => new Promise<void>((resolve) => s.close(() => resolve()))))
    },
  }
}
