/**
 * The admin listener inside the daemon: BFF first, the embedded SPA for everything else.
 * Loopback by default; a non-loopback bind needs the password login that lands in iteration 5,
 * so until then it is refused with the SSH-forwarding hint rather than started unprotected.
 */

import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { AtcError } from '../errors/index.js'
import type { Logger } from '../output/index.js'
import { createBffHandler } from './bff.js'
import type { BffDeps } from './bff.js'
import { isLoopbackHost } from './gates.js'
import { serveStatic } from './static.js'

export interface AdminServerOptions extends Omit<BffDeps, 'loopbackOnly' | 'log'> {
  host: string
  port: number
  log: Logger
}

export class AdminServer {
  private constructor(
    private readonly server: Server,
    readonly host: string,
    readonly port: number
  ) {}

  get url(): string {
    const host = this.host.includes(':') ? `[${this.host}]` : this.host
    return `http://${host}:${this.port}`
  }

  static async start(options: AdminServerOptions): Promise<AdminServer> {
    const loopback = isLoopbackHost(options.host)
    if (!loopback) {
      throw new AtcError('ATC_ADMIN_BIND_FAILED', `The admin cannot listen on ${options.host} yet.`, {
        details: 'a non-loopback admin needs the password login planned for iteration 5',
        hint: 'keep 127.0.0.1 and forward it: ssh -L 1338:127.0.0.1:1338 user@server',
      })
    }
    const bff = createBffHandler({ ...options, loopbackOnly: true })
    const server = createServer((req, res) => {
      void bff(req, res).then((handled) => {
        if (handled) return
        const pathname = new URL(req.url ?? '/', 'http://atc.local').pathname
        const asset = (req.method === 'GET' || req.method === 'HEAD') && serveStatic(pathname)
        if (!asset) {
          res.writeHead(404, { 'content-type': 'text/plain' })
          res.end('not found')
          return
        }
        res.writeHead(asset.status, asset.headers)
        res.end(req.method === 'HEAD' ? undefined : asset.body)
      })
    })
    server.keepAliveTimeout = 65_000
    let requestedPort = options.port
    try {
      await listen(server, options.host, requestedPort).catch(async (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EADDRINUSE' || requestedPort === 0) throw error
        // Bind port 0 directly: probing or scanning leaves a race before the actual listen.
        requestedPort = 0
        await listen(server, options.host, requestedPort)
      })
    } catch (error) {
      const failure = error as NodeJS.ErrnoException
      throw new AtcError(
        'ATC_ADMIN_BIND_FAILED',
        `The admin could not listen on ${options.host}:${requestedPort}.`,
        {
          details: failure.code === 'EADDRINUSE' ? 'the port is in use' : failure.message,
          hint: 'choose another with `atc config set admin.port <port>`',
        }
      )
    }
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : options.port
    const admin = new AdminServer(server, options.host, port)
    if (options.port !== 0 && requestedPort === 0)
      options.log.warn(`Port ${options.host}:${options.port} is in use; web admin moved to ${admin.url}`)
    options.log.info(`admin listening on ${admin.url}`)
    return admin
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.server.closeAllConnections?.()
      this.server.close(() => resolve())
    })
  }
}

/** Remove both one-shot listeners before retrying a failed bind on the same server. */
function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const failed = (error: Error) => {
      server.off('listening', ready)
      reject(error)
    }
    const ready = () => {
      server.off('error', failed)
      resolve()
    }
    server.once('error', failed)
    server.once('listening', ready)
    server.listen(port, host)
  })
}
