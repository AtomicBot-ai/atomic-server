import { object } from './validation.js'
export interface OAuthMetadata {
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint?: string
  scopes_supported?: string[]
}
export function secureOAuthUrl(value: string) {
  const url = new URL(value)
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
    throw new Error('OAuth endpoints must use HTTPS.')
  if (url.username || url.password || url.hash)
    throw new Error('OAuth URL contains unsupported credentials or a fragment.')
  return url.toString()
}
async function metadata(url: string, request: typeof fetch) {
  const response = await request(secureOAuthUrl(url), {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`OAuth discovery returned HTTP ${response.status}.`)
  const text = await response.text()
  if (text.length > 1024 * 1024) throw new Error('OAuth discovery response is too large.')
  return object(JSON.parse(text))
}
export async function discoverOAuth(resource: string, request: typeof fetch): Promise<OAuthMetadata> {
  const target = new URL(secureOAuthUrl(resource)),
    candidates = [
      `${target.origin}/.well-known/oauth-protected-resource${target.pathname === '/' ? '' : target.pathname}`,
      `${target.origin}/.well-known/oauth-protected-resource`,
    ]
  const challenge = await request(target, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json, text/event-stream' },
  })
  const advertised = /resource_metadata="([^"]+)"/.exec(challenge.headers.get('www-authenticate') ?? '')?.[1]
  await challenge.body?.cancel()
  if (advertised) candidates.unshift(advertised)
  let protectedResource: Record<string, unknown> | undefined
  for (const url of [...new Set(candidates)]) {
    try {
      protectedResource = await metadata(url, request)
      if (Array.isArray(protectedResource['authorization_servers'])) break
    } catch {
      /* Try the standard discovery location. */
    }
  }
  if (
    protectedResource?.['resource'] &&
    secureOAuthUrl(String(protectedResource['resource'])) !== target.toString()
  )
    throw new Error('OAuth resource metadata does not match this connector.')
  const issuer = String(
    (protectedResource?.['authorization_servers'] as unknown[] | undefined)?.[0] ?? target.origin
  )
  const auth = new URL(secureOAuthUrl(issuer)),
    locations = [
      `${auth.origin}/.well-known/oauth-authorization-server${auth.pathname === '/' ? '' : auth.pathname}`,
      `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`,
    ]
  let found: Record<string, unknown> | undefined
  for (const url of locations) {
    try {
      found = await metadata(url, request)
      break
    } catch {
      /* Try OpenID discovery. */
    }
  }
  if (!found?.['authorization_endpoint'] || !found['token_endpoint'])
    throw new Error(
      'This connector does not publish OAuth sign-in metadata. Configure its authentication header instead.'
    )
  if (found['issuer'] && String(found['issuer']).replace(/\/$/, '') !== issuer.replace(/\/$/, ''))
    throw new Error('OAuth discovery issuer does not match the advertised server.')
  if (
    Array.isArray(found['code_challenge_methods_supported']) &&
    !found['code_challenge_methods_supported'].includes('S256')
  )
    throw new Error('This connector does not support secure PKCE sign-in.')
  return {
    authorization_endpoint: secureOAuthUrl(String(found['authorization_endpoint'])),
    token_endpoint: secureOAuthUrl(String(found['token_endpoint'])),
    ...(found['registration_endpoint']
      ? { registration_endpoint: secureOAuthUrl(String(found['registration_endpoint'])) }
      : {}),
    // The authorization server may serve unrelated APIs. Request only this resource's scopes.
    ...(Array.isArray(protectedResource?.['scopes_supported'])
      ? {
          scopes_supported: protectedResource['scopes_supported'].filter(
            (scope): scope is string =>
              typeof scope === 'string' &&
              /^[\x21\x23-\x5B\x5D-\x7E]+$/.test(scope) &&
              (!Array.isArray(found['scopes_supported']) || found['scopes_supported'].includes(scope))
          ),
        }
      : {}),
  }
}
