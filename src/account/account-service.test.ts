import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FakeAccountBackend } from '../../test/helpers/fake-account-backend.js'
import type { AccountSignInStep, WorkspaceAccount } from '../contract/index.js'
import { AccountService } from './account-service.js'

describe('the account service', () => {
  let dir: string
  let backend: FakeAccountBackend
  let enabled: boolean
  let broughtUp: number
  let service: AccountService

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'atc-account-'))
    backend = new FakeAccountBackend()
    enabled = true
    broughtUp = 0
    service = new AccountService(options())
    await service.start()
  })
  function options(): ConstructorParameters<typeof AccountService>[0] {
    return {
      atcDir: dir,
      fetch: backend.fetch,
      env: {},
      platform: 'linux',
      hostname: () => 'lab.local',
      enabled: () => enabled,
      reachability: async () => ({
        tunnel: { state: 'online', url: 'https://w.trycloudflare.com' },
        server: { running: true, host: '127.0.0.1', port: 1339, prefix: '/v1' },
        lanAddresses: [],
      }),
      bringUp: async () => {
        broughtUp += 1
      },
      log: { info: () => {}, warn: () => {} },
    }
  }
  afterEach(async () => {
    service.stop()
    await service.remote.settled()
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
  })

  const status = () => service.execute('account.status', {}) as Promise<WorkspaceAccount>

  it('refuses everything while accounts are off', async () => {
    enabled = false
    await expect(status()).rejects.toMatchObject({ code: 'ATC_ACCOUNT_DISABLED' })
    expect(service.keys()).toEqual([])
  })

  it('signs in by email as an Atomic Server, and refuses a second sign-in over it', async () => {
    const step = (await service.execute('account.signin.email.start', {
      email: 'ann@example.com',
    })) as AccountSignInStep
    expect(step.state).toBe('email_sent')
    const start = backend.calls.find((c) => c.path === '/v1/auth/email/start')!.body as {
      client: Record<string, unknown>
    }
    expect(start.client).toMatchObject({ client_type: 'server', device_name: 'lab', platform: 'atc-linux' })
    expect(start.client['installation_id']).toMatch(/^[A-Za-z0-9_-]{43}$/)
    await expect(service.execute('account.signin.email.verify', { code: '000000' })).rejects.toMatchObject({
      code: 'ATC_USAGE',
      message: 'Wrong code; 4 attempts left.',
    })
    const account = (await service.execute('account.signin.email.verify', {
      code: '123 456',
    })) as WorkspaceAccount
    expect(account).toMatchObject({ signed_in: true, user: { email: 'ann@example.com' } })
    await expect(
      service.execute('account.signin.email.start', { email: 'b@example.com' })
    ).rejects.toMatchObject({
      code: 'ATC_ACCOUNT_SIGNED_IN',
    })
  })

  it('needs a sign-in before sharing', async () => {
    await expect(service.execute('account.remote.share', { enabled: true })).rejects.toMatchObject({
      code: 'ATC_ACCOUNT_REQUIRED',
    })
  })

  it('shares after bringing the API up, and signing out ends every device’s access', async () => {
    await service.execute('account.signin.email.start', { email: 'ann@example.com' })
    await service.execute('account.signin.email.verify', { code: '123456' })
    const shared = (await service.execute('account.remote.share', { enabled: true })) as WorkspaceAccount
    expect(broughtUp).toBe(1)
    expect(shared.remote.sharing).toBe(true)
    const grant = backend.request({
      name: 'MacBook',
      publicKey: 'B6N8vBQgk8i3VdwbEOhstCY3StFqqFPtC9_AsrhtHHw',
    })
    for (let i = 0; i < 500 && (await status()).remote.requests.length === 0; i++)
      await new Promise((resolve) => setTimeout(resolve, 10))
    await service.execute('account.remote.decide', { grant_id: grant.id, allow: true })
    for (let i = 0; i < 500 && service.keys().length === 0; i++)
      await new Promise((resolve) => setTimeout(resolve, 10))
    expect(service.keys()).toHaveLength(1)
    const after = (await service.execute('account.signout', {})) as WorkspaceAccount
    expect(after.signed_in).toBe(false)
    for (let i = 0; i < 100 && service.keys().length > 0; i++)
      await new Promise((resolve) => setTimeout(resolve, 10))
    expect(service.keys()).toEqual([])
    expect((await status()).remote).toMatchObject({ sharing: false, devices: [] })
  })

  it('brings the API and the tunnel back after a restart while sharing is on', async () => {
    await service.resume()
    expect(broughtUp).toBe(0)
    await service.execute('account.signin.email.start', { email: 'ann@example.com' })
    await service.execute('account.signin.email.verify', { code: '123456' })
    await service.execute('account.remote.share', { enabled: true })
    service.stop()
    broughtUp = 0
    await service.start()
    await service.resume()
    expect(broughtUp).toBe(1)
    expect(service.view().remote.sharing).toBe(true)
  })

  it('can always turn sharing off, signed in or not', async () => {
    const off = (await service.execute('account.remote.share', { enabled: false })) as WorkspaceAccount
    expect(off.remote.sharing).toBe(false)
  })

  it('shares nothing from a file another account left behind', async () => {
    await service.execute('account.signin.email.start', { email: 'ann@example.com' })
    await service.execute('account.signin.email.verify', { code: '123456' })
    await service.execute('account.remote.share', { enabled: true })
    const grant = backend.request({ name: 'Mac', publicKey: 'B6N8vBQgk8i3VdwbEOhstCY3StFqqFPtC9_AsrhtHHw' })
    for (let i = 0; i < 500 && (await status()).remote.requests.length === 0; i++)
      await new Promise((resolve) => setTimeout(resolve, 10))
    await service.execute('account.remote.decide', { grant_id: grant.id, allow: true })
    for (let i = 0; i < 500 && service.keys().length === 0; i++)
      await new Promise((resolve) => setTimeout(resolve, 10))
    expect(service.keys()).toHaveLength(1)
    service.stop()
    // The session file is gone (deleted by hand, say): the device file alone opens nothing.
    await rm(join(dir, 'account.json'))
    const fresh = new AccountService({ ...options(), fetch: backend.fetch })
    await fresh.start()
    await fresh.resume()
    expect(fresh.keys()).toEqual([])
    expect(fresh.view().remote.sharing).toBe(false)
    fresh.stop()
  })

  it('refuses to allow a request it was not shown', async () => {
    await service.execute('account.signin.email.start', { email: 'ann@example.com' })
    await service.execute('account.signin.email.verify', { code: '123456' })
    await service.execute('account.remote.share', { enabled: true })
    await expect(
      service.execute('account.remote.decide', {
        grant_id: '6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b',
        allow: true,
      })
    ).rejects.toMatchObject({ code: 'ATC_USAGE' })
  })

  it('opens a pairing code only while sharing', async () => {
    await service.execute('account.signin.email.start', { email: 'ann@example.com' })
    await service.execute('account.signin.email.verify', { code: '123456' })
    await expect(service.execute('account.remote.pairing.open', {})).rejects.toMatchObject({
      code: 'ATC_USAGE',
    })
  })

  it('tells the remote host about core events that change its reachability', () => {
    expect(() => service.event('remote-access:status')).not.toThrow()
    expect(() => service.event('server:started')).not.toThrow()
  })
})
