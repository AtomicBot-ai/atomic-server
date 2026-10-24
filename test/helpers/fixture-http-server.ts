// Lifted from atomic-chat-core/test/helpers/fixture-http-server.ts @ 8a38521 (v0.17.0); adapted: `holdAfterBytes` keeps a body open until `release()`, every GET is counted per path, a request's `Authorization` is recorded, and `cut()` breaks held connections.
/**
 * Scripted HTTP server for download tests: serves in-memory files with Range/206 support, and lets a
 * test inject failures (drop the connection after N bytes, answer a status, refuse Range).
 */
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'

export interface ServedFile {
  body: Buffer
  /** Serve ranges (206) — default true. When false a Range request gets a full 200. */
  ranges?: boolean
  /** Close the socket after this many bytes of the first N responses. */
  dropAfterBytes?: number
  dropTimes?: number
  /** Answer this status (with a small body) for the first N requests. */
  failStatus?: number
  failTimes?: number
  /** Omit Content-Length on HEAD. */
  noHeadLength?: boolean
  /** Send this Content-Range instead of the correct one. */
  badContentRange?: string
  /** Wait before sending the body (lets a test cancel mid-flight). */
  delayMs?: number
  /** Send this many bytes of every body, then hold the rest until `release()`. */
  holdAfterBytes?: number
}

export class FixtureHttpServer {
  readonly files = new Map<string, ServedFile>()
  readonly requests: Array<{ method: string; path: string; range?: string; authorization?: string }> = []
  private server: Server | undefined
  private port = 0
  private drops = new Map<string, number>()
  private fails = new Map<string, number>()
  private held: Array<() => void> = []
  private heldSockets: Array<() => void> = []
  /** Bytes of body sent per path, for tests that bound what a resume fetched again. */
  readonly sent = new Map<string, number>()

  async start(): Promise<string> {
    this.server = createServer((req, res) => this.handle(req, res))
    await new Promise<void>((r) => this.server?.listen(0, '127.0.0.1', r))
    const addr = this.server.address()
    this.port = typeof addr === 'object' && addr ? addr.port : 0
    return `http://127.0.0.1:${this.port}`
  }

  async stop(): Promise<void> {
    const server = this.server
    if (!server) return
    this.server = undefined
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
      // Cancelled downloads may leave an in-flight socket after release().
      server.closeAllConnections()
    })
  }

  /** Finish every body `holdAfterBytes` is holding. */
  release(): void {
    this.heldSockets.length = 0
    for (const finish of this.held.splice(0)) finish()
  }

  /** Cut every connection `holdAfterBytes` is holding: the client sees its stream break. */
  cut(): void {
    this.held.length = 0
    for (const destroy of this.heldSockets.splice(0)) destroy()
  }

  reset(): void {
    this.files.clear()
    this.requests.length = 0
    this.sent.clear()
    this.drops.clear()
    this.fails.clear()
    this.release()
  }

  url(path: string): string {
    return `http://127.0.0.1:${this.port}${path}`
  }

  private handle(req: IncomingMessage, res: ServerResponse) {
    const path = req.url ?? '/'
    const range = req.headers.range
    const authorization = req.headers.authorization
    this.requests.push({
      method: req.method ?? '',
      path,
      ...(range ? { range } : {}),
      ...(authorization ? { authorization } : {}),
    })
    const file = this.files.get(path)
    if (!file) {
      res.writeHead(404).end('not found')
      return
    }
    const failsLeft = this.fails.get(path) ?? file.failTimes ?? 0
    if (file.failStatus && failsLeft > 0) {
      this.fails.set(path, failsLeft - 1)
      res.writeHead(file.failStatus).end('scripted failure')
      return
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, file.noHeadLength ? {} : { 'content-length': String(file.body.length) }).end()
      return
    }
    let start = 0
    let end = file.body.length - 1
    let status = 200
    const headers: Record<string, string> = {}
    if (range && file.ranges !== false) {
      // `bytes=N-` (resume) or `bytes=N-M` (one bounded range of a parallel download).
      const m = /^bytes=(\d+)-(\d*)$/.exec(range)
      if (m) {
        start = Number(m[1])
        if (start >= file.body.length) {
          res.writeHead(416).end()
          return
        }
        if (m[2] !== '') end = Math.min(end, Number(m[2]))
        status = 206
        headers['content-range'] = file.badContentRange ?? `bytes ${start}-${end}/${file.body.length}`
      }
    }
    const slice = file.body.subarray(start, end + 1)
    headers['content-length'] = String(slice.length)
    res.writeHead(status, headers)
    const count = (bytes: number) => this.sent.set(path, (this.sent.get(path) ?? 0) + bytes)
    const dropsLeft = this.drops.get(path) ?? file.dropTimes ?? 0
    if (file.dropAfterBytes !== undefined && dropsLeft > 0) {
      this.drops.set(path, dropsLeft - 1)
      // Flush the partial body, then kill the socket so the client sees a truncated stream.
      count(Math.min(file.dropAfterBytes, slice.length))
      res.write(slice.subarray(0, file.dropAfterBytes), () => setTimeout(() => res.socket?.destroy(), 20))
      return
    }
    if (file.holdAfterBytes !== undefined && file.holdAfterBytes < slice.length) {
      const head = slice.subarray(0, file.holdAfterBytes)
      count(head.length)
      res.write(head)
      this.held.push(() => {
        count(slice.length - head.length)
        if (!res.destroyed) res.end(slice.subarray(file.holdAfterBytes))
      })
      this.heldSockets.push(() => res.socket?.destroy())
      return
    }
    count(slice.length)
    if (file.delayMs) setTimeout(() => res.end(slice), file.delayMs)
    else res.end(slice)
  }
}
