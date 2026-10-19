// Lifted from atomic-chat-core/src/downloads/proxy-fetch.ts @ 8a38521 (v0.17.0); adapted: split into proxy-fetch.ts, proxy-tunnel.ts and http1.ts for the 300-line limit; this file holds the HTTP/1.1 response parsing.
/** HTTP/1.1 response heads and bodies over a raw socket, for the proxy client (`proxy-fetch.ts`). */

import type { Socket } from 'node:net'

export class ProxyTunnelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProxyTunnelError'
  }
}

export interface ResponseHead {
  status: number
  statusText: string
  headers: Headers
  rest: Buffer
}

export function readHead(socket: Socket, signal: AbortSignal | null = null): Promise<ResponseHead> {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0)
    const cleanup = () => {
      socket.off('data', onData)
      socket.off('error', onError)
      socket.off('end', onEnd)
      signal?.removeEventListener('abort', onAbort)
    }
    const onError = (e: Error) => {
      cleanup()
      reject(e)
    }
    const onEnd = () => onError(new Error('connection closed before response head'))
    const onAbort = () => {
      socket.destroy()
      onError(abortError())
    }
    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk])
      const i = buf.indexOf('\r\n\r\n')
      if (i < 0) return
      cleanup()
      const lines = buf.subarray(0, i).toString('latin1').split('\r\n')
      const m = /^HTTP\/1\.[01] (\d{3}) ?(.*)$/.exec(lines[0] ?? '')
      if (!m) return reject(new Error(`bad status line: ${lines[0]}`))
      const headers = new Headers()
      for (const line of lines.slice(1)) {
        const j = line.indexOf(':')
        if (j > 0) headers.append(line.slice(0, j).trim().toLowerCase(), line.slice(j + 1).trim())
      }
      resolve({ status: Number(m[1]), statusText: m[2] ?? '', headers, rest: buf.subarray(i + 4) })
    }
    if (signal?.aborted) return onAbort()
    signal?.addEventListener('abort', onAbort, { once: true })
    socket.on('data', onData)
    socket.once('error', onError)
    socket.once('end', onEnd)
  })
}

interface Decoder {
  feed: (chunk: Buffer) => { out: Buffer[]; done: boolean }
  finish: () => Error | undefined
}

function makeDecoder(headers: Headers): Decoder {
  const te = headers.get('transfer-encoding')
  if (te && /chunked/i.test(te)) {
    let buf = Buffer.alloc(0)
    let size = -1
    let terminal = false
    let done = false
    return {
      feed(chunk) {
        buf = Buffer.concat([buf, chunk])
        const out: Buffer[] = []
        for (;;) {
          if (terminal) {
            if (buf.subarray(0, 2).equals(Buffer.from('\r\n'))) {
              done = true
              return { out, done }
            }
            const trailersEnd = buf.indexOf('\r\n\r\n')
            if (trailersEnd < 0) return { out, done: false }
            done = true
            return { out, done }
          }
          if (size < 0) {
            const i = buf.indexOf('\r\n')
            if (i < 0) return { out, done: false }
            const line = buf.subarray(0, i).toString('latin1').split(';', 1)[0]?.trim() ?? ''
            if (!/^[0-9a-f]+$/i.test(line)) throw new ProxyTunnelError('invalid chunk size')
            size = Number.parseInt(line, 16)
            buf = buf.subarray(i + 2)
            if (size === 0) {
              terminal = true
              continue
            }
          }
          if (buf.length < size + 2) return { out, done: false }
          if (buf[size] !== 13 || buf[size + 1] !== 10) throw new ProxyTunnelError('invalid chunk terminator')
          out.push(buf.subarray(0, size))
          buf = buf.subarray(size + 2)
          size = -1
        }
      },
      finish: () => (done ? undefined : new ProxyTunnelError('response ended before the final chunk')),
    }
  }
  const cl = headers.get('content-length')
  if (cl !== null) {
    let left = Number(cl)
    if (!Number.isSafeInteger(left) || left < 0) throw new ProxyTunnelError('invalid Content-Length')
    return {
      feed(chunk) {
        const take = chunk.subarray(0, left)
        left -= take.length
        return { out: take.length ? [take] : [], done: left === 0 }
      },
      finish: () =>
        left === 0
          ? undefined
          : new ProxyTunnelError(`response ended with ${left} Content-Length bytes missing`),
    }
  }
  return {
    feed: (chunk) => ({ out: [chunk], done: false }),
    finish: () => undefined,
  } // delimited by connection close
}

export function bodyStream(
  socket: Socket,
  rest: Buffer,
  headers: Headers,
  method: string,
  status: number
): ReadableStream<Uint8Array> | null {
  if (method === 'HEAD' || status === 204 || status === 304 || status === 101) {
    socket.destroy()
    return null
  }
  const decode = makeDecoder(headers)
  const cl = headers.get('content-length')
  if (cl !== null && Number(cl) === 0 && rest.length === 0) {
    socket.destroy()
    return null
  }
  let closed = false
  const close = (ctrl: ReadableStreamDefaultController<Uint8Array>) => {
    if (closed) return
    closed = true
    try {
      ctrl.close()
    } catch {
      /* already closed */
    }
    socket.destroy()
  }
  return new ReadableStream<Uint8Array>(
    {
      start(ctrl) {
        const feed = (chunk: Buffer) => {
          try {
            const { out, done } = decode.feed(chunk)
            for (const b of out) ctrl.enqueue(new Uint8Array(b))
            if (done) close(ctrl)
            else if (ctrl.desiredSize !== null && ctrl.desiredSize <= 0) socket.pause()
          } catch (error) {
            closed = true
            ctrl.error(error)
            socket.destroy()
          }
        }
        socket.on('data', feed)
        socket.on('end', () => {
          if (closed) return
          const error = decode.finish()
          if (error) {
            closed = true
            ctrl.error(error)
          } else close(ctrl)
        })
        socket.on('error', (e) => {
          if (closed) return
          closed = true
          try {
            ctrl.error(e)
          } catch {
            /* stream already errored */
          }
        })
        if (rest.length) feed(rest)
      },
      pull() {
        socket.resume()
      },
      cancel() {
        closed = true
        socket.destroy()
      },
    },
    { highWaterMark: 4 * 1024 * 1024, size: (chunk) => chunk.byteLength }
  )
}

export function abortError(): Error {
  return new DOMException('This operation was aborted', 'AbortError')
}
