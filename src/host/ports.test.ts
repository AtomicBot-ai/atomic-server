import { createServer } from 'node:net'
import type { Server } from 'node:net'
import { describe, expect, it } from 'vitest'
import { probePort } from './ports.js'

async function hold(host: string): Promise<{ server: Server; port: number }> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, host, () => resolve())
  })
  return { server, port: (server.address() as { port: number }).port }
}

const release = (server: Server) => new Promise<void>((r) => server.close(() => r()))

describe('probePort', () => {
  it('tells a busy port from a free one', async () => {
    const { server, port } = await hold('127.0.0.1')
    expect(await probePort('127.0.0.1', port)).toBe('busy')
    await release(server)
    expect(await probePort('127.0.0.1', port)).toBe('free')
  })

  // BSD sockets (macOS) let a loopback bind succeed beside a wildcard listener and the reverse: a
  // program on `0.0.0.0:1337` (the Atomic Chat desktop app's default) would otherwise read as free.
  // Linux: a dual-stack `::` bind covers IPv4, so the probes must not collide with each other.
  it.each(['127.0.0.1', '0.0.0.0', '::'])(
    'reads a port nobody holds as free when asked about %s',
    async (asked) => {
      const { server, port } = await hold('127.0.0.1')
      await release(server)
      expect(await probePort(asked, port)).toBe('free')
    }
  )

  it.each([
    ['0.0.0.0', '127.0.0.1'],
    ['127.0.0.1', '0.0.0.0'],
    ['::', '127.0.0.1'],
    ['localhost', '127.0.0.1'],
  ])('sees a listener on %s when asked about %s', async (held, asked) => {
    const { server, port } = await hold(held)
    try {
      expect(await probePort(asked, port)).toBe('busy')
    } finally {
      await release(server)
    }
  })
})
