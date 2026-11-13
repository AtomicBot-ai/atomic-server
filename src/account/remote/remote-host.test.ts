import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FakeAccountBackend } from '../../../test/helpers/fake-account-backend.js'
import { AccountApiError } from '../account-api.js'
import type { TokenResponse } from '../account-store.js'
import { AccountSession } from '../session.js'
import { codeSecret, devicePublicKey, newDeviceSecret, normalizeCode, pairProof, unb64u } from './protocol.js'
import { openCredential, openEndpoints, verifyCredentialMac } from './sealed.js'
import { remoteApi } from './remote-api.js'
import { RemoteHost } from './remote-host.js'
import type { ReachabilityInput } from './reachability.js'

const silent = { info: () => {}, warn: () => {} }

async function until(check: () => boolean | Promise<boolean>, ms = 5000): Promise<void> {
  const end = Date.now() + ms
  while (!(await check())) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('the remote access host', () => {
  let dir: string
  let backend: FakeAccountBackend
  let session: AccountSession
  let host: RemoteHost
  let reach: ReachabilityInput

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'atc-remote-'))
    backend = new FakeAccountBackend()
    session = new AccountSession({ atcDir: dir, call: backend.call })
    const tokens = await backend.call<TokenResponse>('POST', '/v1/auth/email/verify', {
      body: { code: '123456' },
    })
    await session.adopt(tokens)
    reach = {
      tunnel: { state: 'online', url: 'https://words.trycloudflare.com' },
      server: { running: true, host: '127.0.0.1', port: 1339, prefix: '/v1' },
      lanAddresses: [],
    }
    host = new RemoteHost({
      atcDir: dir,
      session,
      api: remoteApi(backend.call),
      hostName: () => 'Lab server',
      reachability: async () => reach,
      log: silent,
    })
  })
  afterEach(async () => {
    host.stop()
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
  })

  function device(name = 'MacBook') {
    const secret = newDeviceSecret()
    return { name, secret, publicKey: devicePublicKey(secret) }
  }

  it('pairs a device by QR link: a sealed key with a MAC, then its sealed addresses', async () => {
    await host.setSharing(true)
    expect(backend.host?.name).toBe('Lab server')
    expect(backend.device?.public_key).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const pairing = await host.openPairing()
    expect(pairing.code).toBe('BCDF-GHJK')
    expect(pairing.qr_svg).toMatch(/^<svg/)
    const k = unb64u(new URL(pairing.link).searchParams.get('k')!)
    const phone = device()
    const grant = backend.pair({ ...phone, proof: pairProof(k, phone.publicKey) })
    await until(() => grant.status === 'active' && grant.blob !== null)

    expect(verifyCredentialMac(k, grant.id, grant.envelope!, grant.mac!)).toBe(true)
    const credential = await openCredential(phone.secret, grant.id, grant.envelope!)
    expect(credential.host_name).toBe('Lab server')
    expect(host.keys()).toEqual([credential.api_key])
    const first = await openEndpoints(unb64u(credential.grant_secret), grant.id, grant.blob!)
    expect(first.endpoints).toEqual([{ kind: 'tunnel', url: 'https://words.trycloudflare.com/v1' }])
    expect(host.view()).toMatchObject({ sharing: true, pairing: null, devices: [{ device_name: 'MacBook' }] })

    // A restarted tunnel has a new URL: every device gets it with a higher sequence number.
    reach.tunnel = { state: 'online', url: 'https://other.trycloudflare.com' }
    host.wake()
    await until(async () => {
      const blob = await openEndpoints(unb64u(credential.grant_secret), grant.id, grant.blob!)
      return blob.seq > first.seq && blob.endpoints[0]?.url === 'https://other.trycloudflare.com/v1'
    })

    // Revoked from another device: the key stops working here.
    backend.revoke(grant.id)
    await until(() => host.keys().length === 0)
    const file = await stat(join(dir, 'remote-access.json'))
    expect(file.mode & 0o777).toBe(0o600)
  })

  it('pairs a typed code with the code letters as the secret', async () => {
    await host.setSharing(true)
    await host.openPairing()
    const laptop = device()
    const secret = codeSecret(normalizeCode('BCDF-GHJK')!)
    const grant = backend.pair({ ...laptop, proof: pairProof(secret, laptop.publicKey) })
    await until(() => grant.status === 'active')
    expect(verifyCredentialMac(secret, grant.id, grant.envelope!, grant.mac!)).toBe(true)
  })

  it('denies a device whose proof does not match the code it showed', async () => {
    await host.setSharing(true)
    await host.openPairing()
    const stranger = device('Stranger')
    const grant = backend.pair({ ...stranger, proof: pairProof(new Uint8Array(32), stranger.publicKey) })
    await until(() => grant.status === 'denied')
    expect(host.keys()).toEqual([])
  })

  it('shows a request with its check code and issues a key without a MAC once allowed', async () => {
    await host.setSharing(true)
    const tablet = device('iPad')
    const grant = backend.request(tablet)
    await until(() => host.view().requests.length === 1)
    expect(host.view().requests[0]).toMatchObject({
      grant_id: grant.id,
      check_code: expect.stringMatching(/^\d{6}$/),
    })
    await host.decide(grant.id, true)
    await until(() => grant.status === 'active')
    expect(grant.mac).toBeNull()
    expect(host.keys()).toHaveLength(1)
    expect(host.view().requests).toEqual([])
  })

  async function allowed(name = 'iPad') {
    const grant = backend.request(device(name))
    await until(() => host.view().requests.some((r) => r.grant_id === grant.id))
    await host.decide(grant.id, true)
    await until(() => grant.status === 'active')
    return grant
  }

  it('stops sharing by ending every device: keys go, grants are revoked, requests denied', async () => {
    await host.setSharing(true)
    const tablet = await allowed()
    const asking = backend.request(device('Pixel'))
    await until(() => host.view().requests.length === 1)
    await host.setSharing(false)
    expect(host.keys()).toEqual([])
    expect(tablet.status).toBe('revoked')
    expect(asking.status).toBe('denied')
    // The host stays registered: sharing again sends no new "new computer" email, and devices pair anew.
    expect(backend.host).not.toBeNull()
    await host.setSharing(true)
    expect(host.keys()).toEqual([])
    expect(host.view()).toMatchObject({ sharing: true, devices: [], requests: [] })
  })

  it('drops the keys here first, even when the account service cannot be told', async () => {
    await host.setSharing(true)
    const tablet = await allowed()
    backend.failures.set('POST /v1/remote/host/sync', new AccountApiError(503, 'http_503'))
    backend.failures.set(`DELETE /v1/remote/grants/${tablet.id}`, new AccountApiError(503, 'http_503'))
    await expect(host.setSharing(false)).rejects.toMatchObject({ status: 503 })
    expect(host.keys()).toEqual([])
    expect(host.view().devices).toEqual([])
    expect(tablet.status).toBe('active')
    // Sharing again revokes a grant this server no longer holds a key for.
    await host.setSharing(true)
    await until(() => tablet.status === 'revoked')
  })

  it('removes the host as well when told to forget', async () => {
    await host.setSharing(true)
    const tablet = await allowed()
    await host.setSharing(false, true)
    expect(tablet.status).toBe('revoked')
    expect(backend.host).toBeNull()
  })

  it('lists a device whose access ended from its side, and not one revoked here', async () => {
    await host.setSharing(true)
    const tablet = await allowed('iPad')
    backend.revoke(tablet.id)
    await until(() => host.keys().length === 0)
    expect(host.view().ended).toEqual([
      { grant_id: tablet.id, device_name: 'iPad', platform: 'macos', at: expect.any(Number) },
    ])
    const phone = await allowed('Pixel')
    await host.revoke(phone.id)
    await until(() => phone.status === 'revoked')
    host.wake()
    await until(() => backend.calls.filter((c) => c.path === '/v1/remote/host/sync').length > 6)
    expect(host.view().ended.map((e) => e.grant_id)).toEqual([tablet.id])
    // Stopping sharing is the person's own doing: nothing to announce, and the list starts over.
    await host.setSharing(false)
    expect(host.view().ended).toEqual([])
  })

  it('forgets every device when told to, and when the account removed this host', async () => {
    await host.setSharing(true)
    const grant = backend.request(device())
    await until(() => host.view().requests.length === 1)
    await host.decide(grant.id, true)
    await until(() => host.keys().length === 1)
    backend.host = null
    backend.changed()
    await until(() => !host.view().sharing)
    expect(host.keys()).toEqual([])
    expect(host.view().devices).toEqual([])
  })

  it('keeps going after the service fails, and says why meanwhile', async () => {
    backend.failures.set('POST /v1/remote/host/sync', new AccountApiError(503, 'http_503'))
    await host.setSharing(true)
    await until(() => host.view().error !== null)
    expect(host.view().error).toContain('503')
    await until(() => host.view().error === null, 8000)
  })
})
