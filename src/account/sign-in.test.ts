import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FakeAccountBackend } from '../../test/helpers/fake-account-backend.js'
import { AccountApiError } from './account-api.js'
import { clientInfo } from './client-info.js'
import { AccountSession } from './session.js'
import { SignIn } from './sign-in.js'

describe('signing in without a browser', () => {
  let dir: string
  let backend: FakeAccountBackend
  let now: number
  let session: AccountSession
  let pending: Array<{ work: () => void; ms: number }>
  let signIn: SignIn

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'atc-signin-'))
    backend = new FakeAccountBackend()
    now = 0
    session = new AccountSession({ atcDir: dir, call: backend.call, now: () => now })
    pending = []
    signIn = new SignIn({
      call: backend.call,
      session,
      now: () => now,
      client: async () => clientInfo({ installationId: 'i'.repeat(43), version: '0.2.17' }),
      schedule: (work, ms) => {
        const entry = { work, ms }
        pending.push(entry)
        return () => void pending.splice(pending.indexOf(entry), 1)
      },
    })
  })
  afterEach(() => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }))

  /** Run the next scheduled poll and let it settle. */
  async function tick(): Promise<void> {
    const next = pending.shift()
    if (!next) throw new Error('nothing scheduled')
    now += next.ms
    next.work()
    for (let i = 0; i < 20; i++) await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  it('polls a device code until it is approved', async () => {
    const step = await signIn.deviceStart()
    expect(step).toMatchObject({ state: 'device', user_code: 'BCDF-GHJK' })
    expect(pending[0]?.ms).toBe(5000)
    await tick()
    expect(session.signedIn()).toBe(false)
    backend.deviceApproved = true
    await tick()
    expect(session.signedIn()).toBe(true)
    expect(signIn.view()).toEqual({ state: 'idle' })
    expect(pending).toEqual([])
  })

  it.each([
    ['access_denied', 'denied'],
    ['expired_token', 'expired'],
  ])('stops on %s', async (code, reason) => {
    await signIn.deviceStart()
    backend.failures.set('POST /v1/auth/token', new AccountApiError(400, code))
    await tick()
    expect(signIn.view()).toMatchObject({ state: 'failed', reason })
    expect(pending).toEqual([])
  })

  it.each([
    [{ interval: 20 }, 20_000],
    [{ interval: 0 }, 10_000],
    [{ interval: null }, 10_000],
    [{}, 10_000],
  ])('slows down by at least 5 s when told to (%j)', async (body, ms) => {
    await signIn.deviceStart()
    backend.failures.set('POST /v1/auth/token', new AccountApiError(400, 'slow_down', body))
    await tick()
    expect(pending[0]?.ms).toBe(ms)
  })

  it('refuses a sign-in page that is not https', async () => {
    const call = backend.call
    const strict = new SignIn({
      session,
      now: () => now,
      client: async () => clientInfo({ installationId: 'i'.repeat(43), version: '0.2.17' }),
      call: async (method, path, options) => {
        const answer = await call(method, path, options)
        return (
          path === '/v1/auth/device/code'
            ? { ...(answer as object), verification_uri_complete: 'javascript:alert(1)' }
            : answer
        ) as never
      },
    })
    await expect(strict.deviceStart()).rejects.toMatchObject({ code: 'ATC_ACCOUNT_UNAVAILABLE' })
  })

  it('shows an expired device code as failed, and cancel drops it', async () => {
    await signIn.deviceStart()
    now += 901_000
    expect(signIn.view()).toMatchObject({ state: 'failed', reason: 'expired' })
    await signIn.deviceStart()
    signIn.cancel()
    expect(signIn.view()).toEqual({ state: 'idle' })
    expect(pending).toEqual([])
  })

  it('checks the address and the code before asking the service', async () => {
    await expect(signIn.emailStart('not-an-address')).rejects.toMatchObject({ code: 'ATC_USAGE' })
    await expect(signIn.emailVerify('123456')).rejects.toMatchObject({ code: 'ATC_USAGE' })
    await signIn.emailStart('ann@example.com')
    await expect(signIn.emailVerify('12345')).rejects.toMatchObject({ message: 'The code has 6 digits.' })
    expect(backend.calls.filter((c) => c.path === '/v1/auth/email/verify')).toHaveLength(0)
  })

  it('drops a challenge the service no longer takes', async () => {
    await signIn.emailStart('ann@example.com')
    backend.failures.set('POST /v1/auth/email/verify', new AccountApiError(400, 'too_many_attempts'))
    await expect(signIn.emailVerify('111111')).rejects.toMatchObject({ code: 'ATC_USAGE' })
    expect(signIn.view()).toEqual({ state: 'idle' })
  })

  it('says to wait when the service limits requests', async () => {
    backend.failures.set('POST /v1/auth/email/start', new AccountApiError(429, 'rate_limited', {}, 120_000))
    await expect(signIn.emailStart('ann@example.com')).rejects.toMatchObject({
      message: 'Too many requests. Try again in 2 min.',
    })
  })
})
