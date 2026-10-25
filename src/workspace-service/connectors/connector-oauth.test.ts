import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { ConnectorOAuth } from './connector-oauth.js'
import { discoverOAuth } from './connector-oauth-discovery.js'
let dir: string, oauth: ConnectorOAuth
const resource = 'https://connector.test/mcp'
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'atc-oauth-'))
})
afterEach(async () => {
  oauth?.cancel('test')
  await rm(dir, { recursive: true, force: true })
})
function discovery(onToken?: (init: RequestInit) => Promise<Response>) {
  return vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname
    if (path === '/mcp') return new Response(null, { status: 401 })
    if (path.includes('oauth-protected-resource'))
      return Response.json({
        resource,
        authorization_servers: ['https://login.test'],
        scopes_supported: ['tools:read'],
      })
    if (path.includes('oauth-authorization-server'))
      return Response.json({
        issuer: 'https://login.test',
        authorization_endpoint: 'https://login.test/authorize',
        token_endpoint: 'https://login.test/token',
        code_challenge_methods_supported: ['S256'],
        scopes_supported: ['tools:read', 'mail:delete', 'admin'],
      })
    if (path === '/token' && onToken) return onToken(init!)
    throw new Error('Unexpected URL')
  })
}
it('uses resource-scoped permissions, state, PKCE and tokens confined to the configured resource', async () => {
  let exchange!: URLSearchParams
  const request = discovery(async (init) => {
    exchange = new URLSearchParams(String(init.body))
    return Response.json({ access_token: 'private-token', token_type: 'Bearer', expires_in: 3600 })
  })
  oauth = new ConnectorOAuth(dir, request)
  const started = await oauth.start('test', resource, 'registered-client'),
    url = new URL(started.url)
  expect(url.searchParams.get('scope')).toBe('tools:read')
  expect(url.searchParams.get('resource')).toBe(resource)
  const callback = new URL(url.searchParams.get('redirect_uri')!)
  callback.searchParams.set('state', 'wrong')
  callback.searchParams.set('code', 'code')
  expect((await fetch(callback)).status).toBe(400)
  expect(oauth.status('test').state).toBe('waiting')
  callback.searchParams.set('state', url.searchParams.get('state')!)
  expect((await fetch(callback)).status).toBe(200)
  expect(exchange.get('resource')).toBe(resource)
  expect(createHash('sha256').update(exchange.get('code_verifier')!).digest('base64url')).toBe(
    url.searchParams.get('code_challenge')
  )
  expect(await oauth.header('test', resource)).toBe('Bearer private-token')
  expect(await oauth.header('test', 'https://other.test/mcp')).toBeUndefined()
  expect(JSON.stringify(oauth.status('test'))).not.toContain('private-token')
})
it('does not ask for unrelated authorization-server scopes when the resource advertises none', async () => {
  const base = discovery(),
    request = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).includes('oauth-protected-resource'))
        return Response.json({ resource, authorization_servers: ['https://login.test'] })
      return base(url, init)
    })
  expect((await discoverOAuth(resource, request)).scopes_supported).toBeUndefined()
})
it('rejects metadata claiming a different protected resource', async () => {
  const request = vi.fn<typeof fetch>(async () =>
    Response.json({ resource: 'https://other.test/mcp', authorization_servers: ['https://login.test'] })
  )
  await expect(discoverOAuth(resource, request)).rejects.toThrow('does not match')
})
it('rejects a second valid callback while the first token exchange is pending', async () => {
  let finish!: (value: Response) => void
  const request = discovery(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  oauth = new ConnectorOAuth(dir, request)
  const url = new URL((await oauth.start('test', resource, 'registered-client')).url)
  const callback = new URL(url.searchParams.get('redirect_uri')!)
  callback.searchParams.set('state', url.searchParams.get('state')!)
  callback.searchParams.set('code', 'code')
  const first = fetch(callback)
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  expect((await fetch(callback)).status).toBe(409)
  finish(Response.json({ access_token: 'private', expires_in: 3600 }))
  expect((await first).status).toBe(200)
})
it('cannot restore or return a refreshed token after logout', async () => {
  await writeFile(
    join(dir, 'connector-oauth.json'),
    JSON.stringify({
      test: {
        resource,
        access_token: 'old',
        refresh_token: 'refresh',
        expires_at: 1,
        client_id: 'client',
        token_endpoint: 'https://login.test/token',
      },
    })
  )
  let finish!: (value: Response) => void
  const request = vi.fn<typeof fetch>(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  oauth = new ConnectorOAuth(dir, request)
  const refreshed = oauth.header('test', resource)
  const checked = expect(refreshed).rejects.toThrow('cancelled')
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  await oauth.logout('test')
  finish(Response.json({ access_token: 'new', expires_in: 3600 }))
  await checked
  expect(JSON.parse(await readFile(join(dir, 'connector-oauth.json'), 'utf8'))).toEqual({})
})
