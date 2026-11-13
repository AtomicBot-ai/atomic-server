/** An `AccountCall` behind `fetch`: what a caller built from `fetch` sees of the in-memory account service. */
import { AccountApiError, type AccountCall } from '../../src/account/account-api.js'

export function accountFetch(call: AccountCall): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const token = new Headers(init?.headers).get('authorization')?.replace(/^Bearer /, '')
    const raw = typeof init?.body === 'string' ? init.body : undefined
    try {
      const result = await call((init?.method ?? 'GET') as 'GET' | 'POST' | 'PUT' | 'DELETE', url.pathname, {
        ...(token ? { token } : {}),
        ...(raw ? { body: JSON.parse(raw) as unknown } : {}),
        ...(init?.signal ? { signal: init.signal } : {}),
      })
      return result === undefined
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(result), { status: 200 })
    } catch (error) {
      if (!(error instanceof AccountApiError)) throw error
      return new Response(JSON.stringify({ ...error.body, error: error.code, detail: 'refused' }), {
        status: error.status,
      })
    }
  }
}
