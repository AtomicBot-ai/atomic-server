import { describe, expect, it } from 'vitest'
import { gateRequest, hostNameOf, isLoopbackAddress, isLoopbackHost } from './gates.js'

const req = (over: { method?: string; headers?: Record<string, string>; peer?: string }) =>
  ({
    method: over.method ?? 'GET',
    headers: over.headers ?? { host: '127.0.0.1:1338' },
    socket: { remoteAddress: over.peer ?? '127.0.0.1' },
  }) as never

describe('gates', () => {
  it('knows loopback', () => {
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true)
    expect(isLoopbackAddress('10.0.0.1')).toBe(false)
    expect(isLoopbackHost('localhost:1338')).toBe(true)
    expect(isLoopbackHost('[::1]:1338')).toBe(true)
    expect(isLoopbackHost('evil.example:1338')).toBe(false)
    expect(hostNameOf('[::1]:1338')).toBe('::1')
    expect(hostNameOf('::1')).toBe('::1')
    expect(hostNameOf('127.0.0.1:1338')).toBe('127.0.0.1')
    expect(hostNameOf('localhost:1338')).toBe('localhost')
    expect(hostNameOf('')).toBe('')
    expect(hostNameOf('[::1')).toBe('')
    expect(isLoopbackHost('::1')).toBe(true)
    expect(isLoopbackHost('2001:db8::1')).toBe(false)
  })

  it('refuses foreign peers and hosts when loopback-only', () => {
    expect(gateRequest(req({ peer: '10.0.0.2' }), { loopbackOnly: true }).status).toBe(403)
    expect(gateRequest(req({ headers: { host: 'rebind.example' } }), { loopbackOnly: true }).status).toBe(421)
    expect(gateRequest(req({}), { loopbackOnly: true }).ok).toBe(true)
  })

  it('requires the admin header and a same-origin Origin for mutations', () => {
    expect(gateRequest(req({ method: 'POST' }), { loopbackOnly: true }).reason).toMatch(/x-atc-admin/)
    expect(
      gateRequest(req({ method: 'POST', headers: { 'host': '127.0.0.1:1338', 'x-atc-admin': '1' } }), {
        loopbackOnly: true,
      }).ok
    ).toBe(true)
    expect(
      gateRequest(
        req({
          method: 'POST',
          headers: { 'host': '127.0.0.1:1338', 'x-atc-admin': '1', 'origin': 'http://127.0.0.1:1338' },
        }),
        { loopbackOnly: true }
      ).ok
    ).toBe(true)
    expect(
      gateRequest(
        req({
          method: 'POST',
          headers: { 'host': '127.0.0.1:1338', 'x-atc-admin': '1', 'origin': 'http://evil.example' },
        }),
        { loopbackOnly: true }
      ).reason
    ).toMatch(/cross-origin/)
  })
})
