import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { join } from 'node:path'
import { readDocument, mutateDocument } from '../terminal-data/index.js'
import { object } from './validation.js'
import { discoverOAuth } from './connector-oauth-discovery.js'
interface Token {
  resource: string
  access_token: string
  refresh_token?: string
  expires_at: number
  client_id: string
  client_secret?: string
  token_endpoint: string
}
interface Pending {
  state: 'waiting' | 'complete' | 'error' | 'cancelled'
  error?: string
  server: Server
  timer: ReturnType<typeof setTimeout>
  exchanging?: boolean
}
/** Browser sign-in lives in the server; access and refresh tokens never enter a frontend snapshot. */
export class ConnectorOAuth {
  private path: string
  private pending = new Map<string, Pending>()
  private refreshing = new Map<string, Promise<Token>>()
  private versions = new Map<string, number>()
  constructor(
    directory: string,
    private request: typeof fetch = fetch
  ) {
    this.path = join(directory, 'connector-oauth.json')
  }
  status(id: string) {
    const item = this.pending.get(id)
    return { state: item?.state ?? 'idle', ...(item?.error ? { error: item.error } : {}) }
  }
  cancel(id: string) {
    this.versions.set(id, (this.versions.get(id) ?? 0) + 1)
    const item = this.pending.get(id)
    if (item) {
      clearTimeout(item.timer)
      item.server.close()
      item.state = 'cancelled'
    }
    return this.status(id)
  }
  async logout(id: string) {
    this.cancel(id)
    await mutateDocument<Record<string, Token>>(this.path, {}, (values) => {
      delete values[id]
      return values
    })
    return { signed_out: true }
  }
  private async save(id: string, value: Token, version: number) {
    await mutateDocument<Record<string, Token>>(this.path, {}, (all) => {
      if ((this.versions.get(id) ?? 0) !== version) throw new Error('Connector sign-in was cancelled.')
      return { ...all, [id]: value }
    })
  }
  private async exchange(
    base: Omit<Token, 'access_token' | 'expires_at'>,
    params: Record<string, string>
  ): Promise<Token> {
    const response = await this.request(base.token_endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({
        ...params,
        client_id: base.client_id,
        ...(base.client_secret ? { client_secret: base.client_secret } : {}),
        resource: base.resource,
      }),
    })
    const value = object(await response.json())
    if (
      !response.ok ||
      typeof value['access_token'] !== 'string' ||
      !value['access_token'] ||
      /[\r\n]/.test(value['access_token'])
    )
      throw new Error(
        `Sign-in failed: ${String(value['error_description'] ?? value['error'] ?? `HTTP ${response.status}`)}`
      )
    if (value['token_type'] && String(value['token_type']).toLowerCase() !== 'bearer')
      throw new Error('Connector returned an unsupported token type.')
    const expiry = Number(value['expires_in'] ?? 3600)
    if (!Number.isFinite(expiry) || expiry <= 0)
      throw new Error('Connector returned an invalid token expiry.')
    return {
      ...base,
      access_token: value['access_token'],
      expires_at: Date.now() + expiry * 1000,
      ...(typeof value['refresh_token'] === 'string' ? { refresh_token: value['refresh_token'] } : {}),
    }
  }
  async header(id: string, resource: string) {
    const stored = await readDocument<Record<string, Token>>(this.path, {})
    let token = Object.hasOwn(stored, id) ? stored[id] : undefined
    if (!token || token.resource !== resource) return undefined
    if (token.expires_at < Date.now() + 30000) {
      if (!token.refresh_token) throw new Error('Connector sign-in expired. Sign in again.')
      let refreshing = this.refreshing.get(id)
      if (!refreshing) {
        const version = this.versions.get(id) ?? 0
        refreshing = this.exchange(token, { grant_type: 'refresh_token', refresh_token: token.refresh_token })
          .then(async (next) => {
            await this.save(id, next, version)
            return next
          })
          .finally(() => this.refreshing.delete(id))
        this.refreshing.set(id, refreshing)
      }
      token = await refreshing
    }
    return `Bearer ${token.access_token}`
  }
  async start(id: string, resource: string, clientId?: string) {
    this.cancel(id)
    const version = this.versions.get(id)!
    const metadata = await discoverOAuth(resource, this.request),
      state = randomBytes(32).toString('base64url'),
      verifier = randomBytes(48).toString('base64url')
    if (this.versions.get(id) !== version) throw new Error('Connector sign-in was cancelled.')
    const server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    if (!address || typeof address === 'string') {
      server.close()
      throw new Error('Could not start the sign-in callback.')
    }
    const redirect = `http://127.0.0.1:${address.port}/oauth/callback`
    let clientSecret: string | undefined
    try {
      if (!clientId) {
        if (!metadata.registration_endpoint)
          throw new Error(
            'This connector needs a registered OAuth client ID. Enter one in the sign-in settings.'
          )
        const registration = await this.request(metadata.registration_endpoint, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: 'Atomic Server',
            redirect_uris: [redirect],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
          }),
        })
        const registered = object(await registration.json())
        if (!registration.ok || typeof registered['client_id'] !== 'string')
          throw new Error(`Connector registration failed (HTTP ${registration.status}).`)
        clientId = registered['client_id']
        if (typeof registered['client_secret'] === 'string') clientSecret = registered['client_secret']
      }
      if (this.versions.get(id) !== version) throw new Error('Connector sign-in was cancelled.')
      const timer = setTimeout(() => {
        const item = this.pending.get(id)
        if (item?.state === 'waiting') {
          item.state = 'error'
          item.error = 'Sign-in timed out. Try again.'
          server.close()
        }
      }, 300000)
      timer.unref()
      const pending: Pending = { state: 'waiting', server, timer }
      this.pending.set(id, pending)
      server.on('request', (req, res) => {
        void (async () => {
          const callback = new URL(req.url ?? '/', redirect)
          if (
            req.method !== 'GET' ||
            callback.pathname !== '/oauth/callback' ||
            callback.searchParams.get('state') !== state
          ) {
            res.writeHead(400)
            res.end('Invalid sign-in callback.')
            return
          }
          if (pending.state !== 'waiting' || pending.exchanging) {
            res.writeHead(409)
            res.end('This sign-in is no longer active.')
            return
          }
          pending.exchanging = true
          try {
            if (callback.searchParams.get('error'))
              throw new Error(
                callback.searchParams.get('error_description') ?? callback.searchParams.get('error')!
              )
            const code = callback.searchParams.get('code')
            if (!code) throw new Error('Sign-in did not return an authorization code.')
            const token = await this.exchange(
              {
                resource,
                token_endpoint: metadata.token_endpoint,
                client_id: clientId!,
                ...(clientSecret ? { client_secret: clientSecret } : {}),
              },
              { grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier }
            )
            if (pending.state !== 'waiting') {
              res.end('Sign-in cancelled.')
              return
            }
            await this.save(id, token, version)
            pending.state = 'complete'
            res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
            res.end('Connected. You can return to Atomic Server.')
          } catch (error) {
            if (pending.state === 'waiting') {
              pending.state = 'error'
              pending.error = error instanceof Error ? error.message : String(error)
            }
            res.writeHead(400, { 'Content-Type': 'text/plain' })
            res.end('Sign-in failed. Return to Atomic Server for details.')
          } finally {
            clearTimeout(timer)
            server.close()
          }
        })()
      })
      const url = new URL(metadata.authorization_endpoint)
      for (const [key, value] of Object.entries({
        response_type: 'code',
        client_id: clientId!,
        redirect_uri: redirect,
        state,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
        resource,
        ...(metadata.scopes_supported?.length ? { scope: metadata.scopes_supported.join(' ') } : {}),
      }))
        url.searchParams.set(key, value)
      return { url: url.toString(), state: 'waiting' }
    } catch (error) {
      server.close()
      throw error
    }
  }
}
