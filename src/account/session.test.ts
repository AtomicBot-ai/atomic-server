import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FakeAccountBackend } from '../../test/helpers/fake-account-backend.js'
import { AccountApiError } from './account-api.js'
import type { TokenResponse } from './account-store.js'
import { AccountSession, type AccountChange } from './session.js'

describe('the account session', () => {
  let dir: string
  let backend: FakeAccountBackend
  let now: number
  let session: AccountSession
  let changes: AccountChange[]

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'atc-session-'))
    backend = new FakeAccountBackend()
    now = 1_000_000
    session = new AccountSession({ atcDir: dir, call: backend.call, now: () => now })
    changes = []
    session.onChange((change) => changes.push(change))
  })
  afterEach(() => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }))

  const signIn = async () =>
    session.adopt(
      await backend.call<TokenResponse>('POST', '/v1/auth/email/verify', { body: { code: '123456' } })
    )

  it('keeps one install id across sign-outs, in an owner-only file', async () => {
    const id = (await session.load()).installation_id
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/)
    await signIn()
    await session.signOut()
    expect(changes).toEqual(['signedIn', 'signedOut'])
    const again = new AccountSession({ atcDir: dir, call: backend.call })
    expect((await again.load()).installation_id).toBe(id)
    expect(again.signedIn()).toBe(false)
    // Windows has no POSIX modes; the data folder's owner-only ACL guards it there.
    if (process.platform !== 'win32') expect((await stat(session.path)).mode & 0o777).toBe(0o600)
  })

  it('refreshes once for callers racing on an expiring token', async () => {
    await signIn()
    now += 899_000 // within two minutes of expiry
    const tokens = await Promise.all([session.accessToken(), session.accessToken(), session.accessToken()])
    expect(new Set(tokens)).toEqual(new Set([backend.accessToken]))
    expect(backend.calls.filter((c) => c.path === '/v1/auth/token')).toHaveLength(1)
  })

  it('refreshes and retries once when a call is refused with 401', async () => {
    await signIn()
    const stale = backend.accessToken
    backend.accessToken = 'rotated-elsewhere'
    let seen: string[] = []
    // The refresh token still works: a new access token comes back and the retry uses it.
    const result = await session.authed(async (token) => {
      seen.push(token)
      if (token === stale) throw new AccountApiError(401, 'invalid_token')
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(seen).toHaveLength(2)
    seen = []
  })

  it('ends the session when the refresh token is refused, and keeps it on a network failure', async () => {
    await signIn()
    now += 899_000
    backend.failures.set('POST /v1/auth/token', new AccountApiError(503, 'http_503'))
    await expect(session.accessToken()).rejects.toMatchObject({ status: 503 })
    expect(session.signedIn()).toBe(true)
    backend.refreshToken = 'revoked'
    await expect(session.accessToken()).rejects.toMatchObject({ code: 'invalid_grant' })
    expect(session.signedIn()).toBe(false)
    expect(changes.at(-1)).toBe('sessionLost')
    expect(JSON.parse(await readFile(session.path, 'utf8')).session).toBeNull()
  })

  it('signs out with a fresh token when the stored one expired, and says the service confirmed it', async () => {
    await signIn()
    now += 3_600_000
    expect(await session.signOut()).toBe(true)
    const logout = backend.calls.filter((c) => c.path === '/v1/auth/logout')
    expect(logout).toHaveLength(1)
    expect(backend.calls.some((c) => c.path === '/v1/auth/token')).toBe(true)
  })

  it('never brings a session back through a refresh that lands after a sign-out', async () => {
    await signIn()
    now += 899_000
    let release: () => void = () => {}
    const slow = new Promise<void>((resolve) => (release = resolve))
    const call = backend.call
    const racing = new AccountSession({
      atcDir: dir,
      now: () => now,
      call: async (method, path, options) => {
        if (path === '/v1/auth/token') await slow
        return call(method, path, options)
      },
    })
    await racing.load()
    const pending = racing.accessToken().catch((e: unknown) => e)
    backend.failures.set('POST /v1/auth/logout', new AccountApiError(500, 'http_500'))
    const out = racing.signOut()
    release()
    await out
    await pending
    expect(racing.signedIn()).toBe(false)
    expect(JSON.parse(await readFile(racing.path, 'utf8')).session).toBeNull()
  })

  it('leaves a file it cannot read alone until a new sign-in', async () => {
    await writeFile(join(dir, 'account.json'), '{"version":1,"installation_id":"x')
    expect((await session.load()).session).toBeNull()
    expect(await readFile(join(dir, 'account.json'), 'utf8')).toBe('{"version":1,"installation_id":"x')
  })

  it('signs out even when the service does not answer', async () => {
    await signIn()
    backend.failures.set('POST /v1/auth/logout', new AccountApiError(500, 'http_500'))
    await session.signOut()
    expect(session.signedIn()).toBe(false)
  })
})
