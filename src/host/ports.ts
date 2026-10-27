/**
 * Is a port free to bind? A listen attempt is the only honest answer, and on BSD sockets (macOS)
 * one attempt is not enough: a loopback bind succeeds beside a wildcard listener and the reverse,
 * so a program on `0.0.0.0:1337` (the Atomic Chat desktop app's default) would read as free from
 * `127.0.0.1`. The port is free only when every address that can shadow the asked one binds too.
 */

import { createServer } from 'node:net'

/** The addresses a listener on `host` shares the port with; `localhost` resolves to `::1` on some hosts. */
export function shadowHosts(host: string): string[] {
  return [...new Set([host, '0.0.0.0', '::', '127.0.0.1', '::1'])]
}

function tryBind(host: string, port: number): Promise<'free' | 'busy' | 'unknown'> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', (e: NodeJS.ErrnoException) =>
      resolve(e.code === 'EADDRINUSE' || e.code === 'EACCES' ? 'busy' : 'unknown')
    )
    server.listen(port, host, () => server.close(() => resolve('free')))
  })
}

export async function probePort(host: string, port: number): Promise<'free' | 'busy'> {
  // One address at a time: on Linux a dual-stack `::` bind covers IPv4 too, so two of these probes
  // run together would see each other as the other program.
  for (const candidate of shadowHosts(host)) {
    const result = await tryBind(candidate, port)
    // A shadow that cannot exist here (no IPv6) says nothing; an address this machine lacks is the
    // core's bind error to report, not another program's port.
    if (result === 'busy') return 'busy'
  }
  return 'free'
}
