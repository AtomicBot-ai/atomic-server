/**
 * Sharing the server through the account (ADR 2026-11-12-share-the-server-with-account-devices), against a
 * real core and the account service in memory: a device that was allowed gets its own key, the public API
 * accepts it next to the keyring's, and refuses it again once the device is revoked or sharing stops.
 */
import { AtomicCore } from '@atomic-chat/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readAdminToken } from '../../src/admin/index.js'
import { resolveConfig } from '../../src/config/index.js'
import type { WorkspaceAccount } from '../../src/contract/index.js'
import { startDaemon } from '../../src/daemon/index.js'
import type { RunningDaemon } from '../../src/daemon/index.js'
import { recordingIo } from '../../src/io.js'
import { runCli } from '../../src/main.js'
import { createLogger } from '../../src/output/index.js'
import { devicePublicKey, newDeviceSecret, unb64u } from '../../src/account/remote/protocol.js'
import { openCredential, openEndpoints } from '../../src/account/remote/sealed.js'
import { FakeAccountBackend } from '../helpers/fake-account-backend.js'
import { fakeHost } from '../helpers/test-context.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

const { paths, cleanup } = tmpDataFolder('atc-account-')
const backend = new FakeAccountBackend()
let daemon: RunningDaemon
let token: string

beforeAll(async () => {
  daemon = await startDaemon({
    paths,
    io: recordingIo({
      env: { PATH: '', ATOMIC_CLOUDFLARED_BIN: '/nonexistent/cloudflared' },
      fetch: backend.fetch,
    }),
    config: resolveConfig({
      env: { ATC_API_AUTO_START: 'false', ATC_UPDATE_CHECK_ON_START: 'false', ATC_ACCOUNT_ENABLED: 'true' },
      fileText: JSON.stringify({ api: { port: 0 } }),
    }),
    host: fakeHost(),
    log: createLogger(() => {}, { level: 'silent' }),
    controlPort: 0,
    admin: { enabled: true, host: '127.0.0.1', port: 0 },
    telemetry: false,
    createCore: (options) =>
      AtomicCore.create({ ...options, fetch: async () => new Response('Offline fixture', { status: 503 }) }),
  })
  token = (await readAdminToken(paths.adminToken)) as string
}, 60_000)

afterAll(async () => {
  await daemon.shutdown().catch(() => undefined)
  cleanup()
})

async function execute<T>(operation: string, input: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${daemon.admin!.url}/api/workspace/execute`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json', 'x-atc-admin': '1' },
    body: JSON.stringify({ operation, input }),
  })
  const body = (await response.json()) as T
  if (response.status !== 200) throw new Error(JSON.stringify(body))
  return body
}

async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  for (let i = 0; i < 500; i++) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('timed out')
}

/** One CLI command against the running server; its exit code, and what it printed. */
async function atc(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const io = recordingIo({ env: { ATC_ACCOUNT_ENABLED: 'true' } })
  const code = await runCli(argv, io, { paths, host: fakeHost() })
  return { code, out: io.out.join(''), err: io.err.join('') }
}

describe('sharing the server with the account’s devices', () => {
  it('signs in and shares from the command line, allows a device by its check code and revokes it', async () => {
    await execute('api.start', { request: { host: '0.0.0.0', port: 0 } })
    expect((await atc(['account'])).out).toContain('Not signed in')
    const login = await atc(['login', '--email', 'ann@example.com', '--code', '123456'])
    expect(login).toMatchObject({ code: 0, err: '' })
    expect(login.out).toContain('Signed in as ann@example.com.')
    expect((await atc(['login'])).out).toContain('run atc logout first')
    expect((await atc(['remote', 'share', 'on'])).out).toContain(
      'Shared with your devices over the local network'
    )

    const secret = newDeviceSecret()
    const grant = backend.request({ name: 'MacBook', publicKey: devicePublicKey(secret) })
    let account: WorkspaceAccount | undefined
    await until(async () => {
      account = JSON.parse((await atc(['account', '--json'])).out).account as WorkspaceAccount
      return account.remote.requests.length === 1
    })
    expect((await atc(['remote', 'allow', '000000'])).code).toBe(2)
    const allow = await atc(['remote', 'allow', account!.remote.requests[0]!.check_code])
    expect(allow.out).toContain('MacBook is allowed.')
    await until(() => grant.status === 'active' && grant.blob !== null)
    const credential = await openCredential(secret, grant.id, grant.envelope!)
    const addresses = await openEndpoints(unb64u(credential.grant_secret), grant.id, grant.blob!)
    const port = new URL(addresses.endpoints[0]!.url).port
    const models = () =>
      fetch(`http://127.0.0.1:${port}/v1/models`, {
        headers: { authorization: `Bearer ${credential.api_key}` },
      })
    expect((await models()).status).toBe(200)
    expect((await atc(['remote', 'devices'])).out).toContain('MacBook')
    expect((await atc(['remote', 'revoke', 'macbook', '--yes'])).out).toContain(
      'MacBook no longer has access.'
    )
    expect((await models()).status).toBe(401)
    expect((await atc(['logout', '--yes'])).out).toContain('Signed out.')
  }, 60_000)

  it('lets an allowed device in with its own key through the admin, and shuts it out once revoked', async () => {
    // LAN only: this machine has no cloudflared, so the API listens on every interface.
    await execute('account.signin.email.start', { email: 'ann@example.com' })
    const signedIn = await execute<WorkspaceAccount>('account.signin.email.verify', { code: '123456' })
    expect(signedIn.signed_in).toBe(true)
    expect((await execute<WorkspaceAccount>('account.remote.share', { enabled: true })).remote.sharing).toBe(
      true
    )

    const secret = newDeviceSecret()
    const grant = backend.request({ name: 'MacBook', publicKey: devicePublicKey(secret) })
    await until(async () => (await execute<WorkspaceAccount>('account.status')).remote.requests.length === 1)
    await execute('account.remote.decide', { grant_id: grant.id, allow: true })
    await until(() => grant.status === 'active' && grant.blob !== null)

    const credential = await openCredential(secret, grant.id, grant.envelope!)
    const addresses = await openEndpoints(unb64u(credential.grant_secret), grant.id, grant.blob!)
    expect(addresses.endpoints.length).toBeGreaterThan(0)
    expect(addresses.endpoints.every((e) => e.kind === 'lan' && e.url.endsWith('/v1'))).toBe(true)

    const port = new URL(addresses.endpoints[0]!.url).port
    const models = (key: string) =>
      fetch(`http://127.0.0.1:${port}/v1/models`, { headers: { authorization: `Bearer ${key}` } })
    expect((await models(credential.api_key)).status).toBe(200)
    expect((await models('atc_not_a_key')).status).toBe(401)

    await execute('account.remote.revoke', { grant_id: grant.id })
    expect((await models(credential.api_key)).status).toBe(401)
  }, 60_000)

  it('ends every device’s access when sharing stops, and names a device that disconnected', async () => {
    if (!(await execute<WorkspaceAccount>('account.status')).signed_in) {
      await execute('account.signin.email.start', { email: 'ann@example.com' })
      await execute('account.signin.email.verify', { code: '123456' })
    }
    await execute('account.remote.share', { enabled: true })
    const allow = async (name: string) => {
      const secret = newDeviceSecret()
      const grant = backend.request({ name, publicKey: devicePublicKey(secret) })
      await until(async () =>
        (await execute<WorkspaceAccount>('account.status')).remote.requests.some(
          (r) => r.grant_id === grant.id
        )
      )
      await execute('account.remote.decide', { grant_id: grant.id, allow: true })
      await until(() => grant.status === 'active' && grant.blob !== null)
      return { grant, credential: await openCredential(secret, grant.id, grant.envelope!) }
    }
    const tablet = await allow('iPad')
    const phone = await allow('Pixel')

    // The phone disconnects on its side: the server names it.
    backend.revoke(phone.grant.id)
    await until(async () =>
      (await execute<WorkspaceAccount>('account.status')).remote.ended.some((e) => e.device_name === 'Pixel')
    )

    const addresses = await openEndpoints(
      unb64u(tablet.credential.grant_secret),
      tablet.grant.id,
      tablet.grant.blob!
    )
    const port = new URL(addresses.endpoints[0]!.url).port
    const models = () =>
      fetch(`http://127.0.0.1:${port}/v1/models`, {
        headers: { authorization: `Bearer ${tablet.credential.api_key}` },
      })
    expect((await models()).status).toBe(200)
    // Devices have access, so it asks first; off a terminal that takes --yes.
    expect((await atc(['remote', 'share', 'off'])).code).not.toBe(0)
    expect(tablet.grant.status).toBe('active')
    const off = await atc(['remote', 'share', 'off', '--yes'])
    expect(off).toMatchObject({ code: 0 })
    expect(off.out).toContain('Not shared with your devices')
    expect(tablet.grant.status).toBe('revoked')
    expect((await models()).status).toBe(401)
    // The host stays on the account, so sharing again sends no new "new computer" email.
    expect(backend.host).not.toBeNull()
    const account = await execute<WorkspaceAccount>('account.status')
    expect(account.remote).toMatchObject({ sharing: false, devices: [], ended: [] })
  }, 60_000)
})
