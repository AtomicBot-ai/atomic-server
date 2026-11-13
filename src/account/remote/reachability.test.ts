import { describe, expect, it } from 'vitest'
import { reachability, sameEndpoints, tunnelState } from './reachability.js'
import { endAccess, emptyRemote, forUser, parseRemoteDocument } from './remote-store.js'

const server = { running: true, host: '127.0.0.1', port: 1339, prefix: '/v1' }

describe('reachability', () => {
  it.each([
    ['online', 'online'],
    ['starting', 'off'],
    ['stopping', 'off'],
    ['error', 'error'],
    [undefined, 'off'],
  ])('reports tunnel %s as %s', (state, expected) => {
    expect(tunnelState(state)).toBe(expected)
  })

  it('offers the tunnel with the API prefix', () => {
    expect(
      reachability({
        tunnel: { state: 'online', url: 'https://w.trycloudflare.com/' },
        server,
        lanAddresses: [],
      })
    ).toEqual({
      tunnel: 'online',
      lan: false,
      endpoints: [{ kind: 'tunnel', url: 'https://w.trycloudflare.com/v1' }],
    })
  })

  it('adds LAN addresses only while the API listens on every interface', () => {
    const lanAddresses = ['192.168.1.5', 'fd7a:115c::5', '127.0.0.1']
    expect(reachability({ tunnel: null, server, lanAddresses }).endpoints).toEqual([])
    expect(
      reachability({ tunnel: null, server: { ...server, host: '0.0.0.0', prefix: 'v1/' }, lanAddresses })
    ).toEqual({
      tunnel: 'off',
      lan: true,
      endpoints: [
        { kind: 'lan', url: 'http://192.168.1.5:1339/v1' },
        { kind: 'lan', url: 'http://[fd7a:115c::5]:1339/v1' },
      ],
    })
  })

  it.each(['198.18.0.1', '198.19.255.1', '169.254.10.2', 'fe80::1', 'FEBF::2', '::1', '127.0.0.2'])(
    'never offers %s, which no other device can dial',
    (address) => {
      const lanServer = { ...server, host: '0.0.0.0' }
      expect(reachability({ tunnel: null, server: lanServer, lanAddresses: [address] }).endpoints).toEqual([])
    }
  )

  it('keeps addresses that only look close to those ranges', () => {
    const lanServer = { ...server, host: '0.0.0.0' }
    const endpoints = reachability({
      tunnel: null,
      server: lanServer,
      lanAddresses: ['198.180.0.1', '10.169.254.1', '100.64.0.7'],
    }).endpoints.map((e) => e.url)
    expect(endpoints).toEqual([
      'http://198.180.0.1:1339/v1',
      'http://10.169.254.1:1339/v1',
      'http://100.64.0.7:1339/v1',
    ])
  })

  it('offers nothing while the API is stopped', () => {
    const stopped = { ...server, running: false, host: '0.0.0.0' }
    expect(
      reachability({
        tunnel: { state: 'online', url: 'https://w.example' },
        server: stopped,
        lanAddresses: ['10.0.0.2'],
      }).endpoints
    ).toEqual([])
  })

  it('compares address lists in order', () => {
    const a = [{ kind: 'tunnel' as const, url: 'https://a/v1' }]
    expect(sameEndpoints(a, [...a])).toBe(true)
    expect(sameEndpoints(a, [{ kind: 'lan', url: 'https://a/v1' }])).toBe(false)
  })
})

describe('the remote access file', () => {
  it('reads a damaged file as empty, which shares nothing', () => {
    expect(parseRemoteDocument('nonsense')).toEqual(emptyRemote())
    expect(parseRemoteDocument({ version: 1, sharing: true, issued: [{ grant_id: 'g' }] })).toMatchObject({
      sharing: true,
      issued: [],
    })
  })

  it('starts over for another user but keeps the address sequence', () => {
    const mine = { ...emptyRemote(9), user_id: 'u1', sharing: true, device_secret: 's' }
    expect(forUser(mine, 'u1')).toBe(mine)
    expect(forUser(mine, 'u2')).toEqual({ ...emptyRemote(9), user_id: 'u2' })
  })

  it('ends access but keeps the device key', () => {
    const shared = {
      ...emptyRemote(3),
      user_id: 'u1',
      device_secret: 's',
      sharing: true,
      host: { host_id: 'h', name: 'Lab' },
    }
    expect(endAccess(shared)).toEqual({ ...shared, sharing: false, host: null, pairing: null, issued: [] })
  })
})
