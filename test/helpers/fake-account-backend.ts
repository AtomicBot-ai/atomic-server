/**
 * The account service (atomic-chat-backend) in memory, as an `AccountCall`: email and device sign-in, token
 * refresh, and the remote access routes a host uses, with long-polls that wait for a change. Devices are
 * played by the test with the reference protocol (`src/account/remote/protocol.ts`, `sealed.ts`).
 */
import { randomUUID } from 'node:crypto'
import { AccountApiError, type AccountCall, type CallOptions } from '../../src/account/account-api.js'
import { accountFetch } from './fake-account-fetch.js'

export interface FakeGrant {
  id: string
  status: 'pending' | 'approved' | 'active' | 'denied' | 'revoked'
  method: 'code' | 'request'
  client: { id: string; client_type: string; device_name: string | null; platform: string | null }
  client_public_key: string
  proof: string | null
  envelope: string | null
  mac: string | null
  blob: string | null
  created_at: string
}

type Handler = (body: Record<string, unknown>, options: CallOptions, match: string[]) => unknown

export class FakeAccountBackend {
  readonly calls: Array<{ method: string; path: string; body: unknown }> = []
  /** A sign-in code mailed to an address; any other code is wrong. */
  emailCode = '123456'
  deviceApproved = false
  accessToken = 'access-1'
  refreshToken = 'refresh-1'
  tokenLifetime = 900
  host: { id: string; name: string } | null = null
  device: { id: string; public_key: string } | null = null
  pairingCode: { code: string; expires_at: string } | null = null
  grants: FakeGrant[] = []
  stateVersion = 1
  /** The next calls to these paths fail with this error (`METHOD /path`). */
  failures = new Map<string, AccountApiError>()
  private waiters = new Set<() => void>()
  private tokenCount = 1

  private tokens() {
    this.accessToken = `access-${++this.tokenCount}`
    this.refreshToken = `refresh-${this.tokenCount}`
    return {
      token_type: 'Bearer',
      access_token: this.accessToken,
      expires_in: this.tokenLifetime,
      refresh_token: this.refreshToken,
      session_id: 'session-1',
      user: { id: 'user-1', email: 'ann@example.com', display_name: null, avatar_url: null, is_new: false },
    }
  }
  /** Something a host sees changed: bump the version and wake its long-poll. */
  changed(): void {
    this.stateVersion += 1
    for (const wake of this.waiters) wake()
    this.waiters.clear()
  }
  private authed(options: CallOptions): void {
    if (options.token !== this.accessToken) throw new AccountApiError(401, 'invalid_token')
  }
  private grant(id: string | undefined): FakeGrant {
    const grant = this.grants.find((g) => g.id === id)
    if (!grant) throw new AccountApiError(404, 'grant_not_found')
    return grant
  }
  private requireHost() {
    if (!this.host) throw new AccountApiError(404, 'host_not_found')
    return this.host
  }

  /** A device pairs with the code this host showed, proving it with `proof`. */
  pair(device: { id?: string; name: string; publicKey: string; proof: string }): FakeGrant {
    const grant: FakeGrant = {
      id: randomUUID(),
      status: 'approved',
      method: 'code',
      client: {
        id: device.id ?? randomUUID(),
        client_type: 'desktop',
        device_name: device.name,
        platform: 'macos',
      },
      client_public_key: device.publicKey,
      proof: device.proof,
      envelope: null,
      mac: null,
      blob: null,
      created_at: new Date().toISOString(),
    }
    this.grants.push(grant)
    this.pairingCode = null
    this.changed()
    return grant
  }
  /** A device asks for access ("Allow" on the host). */
  request(device: { name: string; publicKey: string }): FakeGrant {
    const grant = this.pair({ ...device, proof: '' })
    grant.status = 'pending'
    grant.method = 'request'
    grant.proof = null
    return grant
  }
  revoke(id: string): void {
    this.grant(id).status = 'revoked'
    this.changed()
  }

  private routes: Array<[string, RegExp, Handler]> = [
    [
      'POST',
      /^\/v1\/auth\/email\/start$/,
      () => ({ challenge_id: 'challenge-1', expires_in: 600, resend_in: 60 }),
    ],
    [
      'POST',
      /^\/v1\/auth\/email\/verify$/,
      (body) => {
        if (body['code'] !== this.emailCode)
          throw new AccountApiError(400, 'invalid_code', { error: 'invalid_code', attempts_left: 4 })
        return this.tokens()
      },
    ],
    [
      'POST',
      /^\/v1\/auth\/device\/code$/,
      () => ({
        device_code: 'device-code-1',
        user_code: 'BCDF-GHJK',
        verification_uri: 'https://api.example/activate',
        verification_uri_complete: 'https://api.example/activate?user_code=BCDF-GHJK',
        expires_in: 900,
        interval: 5,
      }),
    ],
    [
      'POST',
      /^\/v1\/auth\/token$/,
      (body) => {
        if (body['grant_type'] === 'refresh_token') {
          if (body['refresh_token'] !== this.refreshToken) throw new AccountApiError(400, 'invalid_grant')
          return this.tokens()
        }
        if (!this.deviceApproved) throw new AccountApiError(400, 'authorization_pending')
        return this.tokens()
      },
    ],
    ['POST', /^\/v1\/auth\/logout$/, () => undefined],
    [
      'PUT',
      /^\/v1\/remote\/device$/,
      (body) => {
        this.device = { id: this.device?.id ?? randomUUID(), public_key: String(body['public_key']) }
        return { id: this.device.id }
      },
    ],
    [
      'PUT',
      /^\/v1\/remote\/host$/,
      (body) => {
        if (!this.device) throw new AccountApiError(409, 'device_not_registered')
        this.host = { id: this.host?.id ?? randomUUID(), name: String(body['name']) }
        return this.host
      },
    ],
    [
      'DELETE',
      /^\/v1\/remote\/host$/,
      () => {
        this.host = null
        for (const g of this.grants) g.status = 'revoked'
      },
    ],
    ['POST', /^\/v1\/remote\/host\/sync$/, (body, options) => this.sync(body, options)],
    [
      'POST',
      /^\/v1\/remote\/host\/pairing-code$/,
      () => {
        this.requireHost()
        const expiresAt = new Date(Date.now() + 600_000).toISOString()
        this.pairingCode = { code: 'BCDF-GHJK', expires_at: expiresAt }
        return { code: 'BCDF-GHJK', expires_in: 600, expires_at: expiresAt }
      },
    ],
    [
      'DELETE',
      /^\/v1\/remote\/host\/pairing-code$/,
      () => {
        this.pairingCode = null
      },
    ],
    [
      'PUT',
      /^\/v1\/remote\/host\/endpoints$/,
      (body) => {
        for (const item of body['items'] as Array<{ grant_id: string; blob: string }>)
          this.grant(item.grant_id).blob = item.blob
      },
    ],
    [
      'POST',
      /^\/v1\/remote\/grants\/([^/]+)\/(approve|deny)$/,
      (_b, _o, [id, verb]) => {
        const grant = this.grant(id)
        if (grant.status !== 'pending' && verb === 'approve') throw new AccountApiError(409, 'invalid_state')
        grant.status = verb === 'approve' ? 'approved' : 'denied'
        this.changed()
      },
    ],
    [
      'PUT',
      /^\/v1\/remote\/grants\/([^/]+)\/credential$/,
      (body, _o, [id]) => {
        const grant = this.grant(id)
        if (grant.status !== 'approved') throw new AccountApiError(409, 'invalid_state')
        if (grant.method === 'code' && !body['mac']) throw new AccountApiError(400, 'mac_required')
        grant.envelope = String(body['envelope'])
        grant.mac = typeof body['mac'] === 'string' ? body['mac'] : null
        grant.status = 'active'
        this.changed()
      },
    ],
    [
      'DELETE',
      /^\/v1\/remote\/grants\/([^/]+)$/,
      (_b, _o, [id]) => {
        this.grant(id).status = 'revoked'
        this.changed()
      },
    ],
  ]

  private async sync(body: Record<string, unknown>, options: CallOptions) {
    const host = this.requireHost()
    const wait = Number(body['wait'] ?? 0)
    if (wait > 0 && body['after'] === this.stateVersion)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, wait * 1000)
        function done() {
          clearTimeout(timer)
          resolve()
        }
        this.waiters.add(done)
        options.signal?.addEventListener('abort', done, { once: true })
      })
    if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    return {
      host,
      state_version: this.stateVersion,
      pairing_code: this.pairingCode ? { expires_at: this.pairingCode.expires_at } : null,
      grants: this.grants
        .filter((g) => ['pending', 'approved', 'active'].includes(g.status))
        .map((g) => ({
          id: g.id,
          status: g.status,
          method: g.method,
          client: g.client,
          client_public_key: g.client_public_key,
          proof: g.proof,
          needs_credential: g.status === 'approved',
          credential_collected: false,
          created_at: g.created_at,
          decided_at: null,
        })),
    }
  }

  readonly call: AccountCall = async <T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options: CallOptions = {}
  ): Promise<T> => {
    const body = (options.body ?? {}) as Record<string, unknown>
    this.calls.push({ method, path, body: options.body })
    const failure = this.failures.get(`${method} ${path}`)
    if (failure) {
      this.failures.delete(`${method} ${path}`)
      throw failure
    }
    for (const [verb, pattern, handler] of this.routes) {
      const match = verb === method ? pattern.exec(path) : null
      if (!match) continue
      if (!path.startsWith('/v1/auth/') || path === '/v1/auth/logout') this.authed(options)
      return (await handler(body, options, match.slice(1))) as T
    }
    throw new AccountApiError(404, 'not_found')
  }
  /** The same service behind `fetch`, for code that builds its own caller (`AccountService`). */
  readonly fetch: typeof fetch = accountFetch(this.call)
}
