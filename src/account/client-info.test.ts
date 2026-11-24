import { describe, expect, it } from 'vitest'
import { AccountApiError, accountApiBase, accountCaller } from './account-api.js'
import { appVersion, clientInfo, deviceName, serverPlatform } from './client-info.js'
import { parseAccountDocument, sessionFromTokens } from './account-store.js'

describe('what the server tells the account service about itself', () => {
  it.each([
    ['lab.local', 'lab'],
    ['  gpu-box\u0007 ', 'gpu-box'],
    ['', undefined],
    ['x'.repeat(120), 'x'.repeat(100)],
  ])('names host %j as %j', (hostname, name) => {
    expect(deviceName(hostname)).toBe(name)
  })

  it('sends atc-<platform> and a version the backend accepts', () => {
    expect(serverPlatform('linux')).toBe('atc-linux')
    expect(serverPlatform('win32')).toBe('atc-win32')
    expect(serverPlatform(undefined)).toBeUndefined()
    expect(appVersion('0.2.17')).toBe('0.2.17')
    expect(appVersion('0.2.17 (dirty)')).toBeUndefined()
    expect(
      clientInfo({ installationId: 'id', hostname: 'lab', platform: 'darwin', version: '1.0.0' })
    ).toEqual({
      client_type: 'server',
      device_name: 'lab',
      platform: 'atc-darwin',
      app_version: '1.0.0',
      installation_id: 'id',
    })
  })
})

describe('the account API caller', () => {
  it.each([
    [undefined, 'https://api.atomic.chat'],
    ['https://staging.example/path', 'https://staging.example'],
    ['http://127.0.0.1:8194', 'http://127.0.0.1:8194'],
  ])('uses %j as %j', (value, base) => {
    expect(accountApiBase(value === undefined ? {} : { ATC_ACCOUNT_API_URL: value })).toBe(base)
  })

  it('refuses plain http off this machine', () => {
    expect(() => accountApiBase({ ATC_ACCOUNT_API_URL: 'http://api.example' })).toThrow(/https/)
  })

  it('turns an error answer into its code, the retry delay and the numbers in its body', async () => {
    const call = accountCaller(
      'https://api.example',
      async () =>
        new Response(JSON.stringify({ error: 'invalid_code', detail: 'nope', attempts_left: 2 }), {
          status: 400,
          headers: { 'retry-after': '30' },
        })
    )
    const error = await call('POST', '/v1/auth/email/verify', { body: {} }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AccountApiError)
    expect(error).toMatchObject({ status: 400, code: 'invalid_code', retryAfterMs: 30_000 })
    expect((error as AccountApiError).body['attempts_left']).toBe(2)
  })

  it('names a bare 401 invalid_token and sends the bearer token', async () => {
    let auth: string | null = null
    const call = accountCaller('https://api.example', async (_url, init) => {
      auth = new Headers(init?.headers).get('authorization')
      return new Response('', { status: 401 })
    })
    await expect(call('GET', '/v1/me', { token: 't' })).rejects.toMatchObject({ code: 'invalid_token' })
    expect(auth).toBe('Bearer t')
  })
})

describe('the account file', () => {
  it('replaces a bad install id and drops a malformed session', () => {
    const doc = parseAccountDocument(
      { version: 1, installation_id: 'short', session: { access_token: 'x' } },
      () => 'n'.repeat(43)
    )
    expect(doc).toEqual({ version: 1, installation_id: 'n'.repeat(43), session: null })
  })

  it('clamps the token lifetime', () => {
    const tokens = {
      access_token: 'a',
      refresh_token: 'r',
      session_id: 's',
      expires_in: 999_999,
      user: { id: 'u', email: 'e@x.y' },
    }
    expect(sessionFromTokens(tokens, 0).access_expires_at).toBe(24 * 3600 * 1000)
    expect(sessionFromTokens({ ...tokens, expires_in: 1 }, 0).access_expires_at).toBe(300_000)
  })
})
