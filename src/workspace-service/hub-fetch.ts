/**
 * A download from Hugging Face with the server's `HF_TOKEN` (spec `litert-lm-models`, "Токен не уходит на
 * чужой хост"): the token goes to the Hub's own origin only. Redirects are followed here, hop by hop, so
 * a resolve link's 302 to a CDN on another domain gets the request without `Authorization`, whatever the
 * runtime's fetch does with headers on a redirect.
 */

const REDIRECTS = [301, 302, 303, 307, 308]
const MAX_HOPS = 10

const plainHeaders = (headers: RequestInit['headers']): Record<string, string> => {
  const out: Record<string, string> = {}
  new Headers(headers).forEach((value, key) => (out[key] = value))
  return out
}

/** `base` with the token on requests to `hub`'s origin and on no other; `base` itself without a token. */
export function hubAuthorized(base: typeof fetch, hub: string, token: string | undefined): typeof fetch {
  if (!token) return base
  const origin = new URL(hub).origin
  const wrapped = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    let url = new URL(input instanceof Request ? input.url : String(input))
    const headers = plainHeaders(init.headers)
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      const own = { ...headers }
      delete own['authorization']
      if (url.origin === origin) own['authorization'] = `Bearer ${token}`
      const response = await base(url, { ...init, headers: own, redirect: 'manual' })
      const location = response.headers.get('location')
      if (!REDIRECTS.includes(response.status) || location === null) return response
      await response.body?.cancel()
      url = new URL(location, url)
    }
    throw new TypeError('too many redirects')
  }
  return wrapped as typeof fetch
}
