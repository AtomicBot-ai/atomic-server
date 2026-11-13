/**
 * The Atomic Chat account API (repository atomic-chat-backend, `api.atomic.chat`): one call shape for
 * sign-in, the session and remote access. Wire format only; what the calls mean lives in the session and
 * the remote host. A body is read only as JSON for its `error` code and the few numbers the flows need:
 * its `detail` text is never shown, so nothing the backend echoes reaches a log.
 */
import { AtcError } from '../errors/index.js'

export const ACCOUNT_API = 'https://api.atomic.chat'
export const ACCOUNT_TIMEOUT_MS = 15_000

/** The backend answered with an error status. `code` is its stable `error` field, or one made from the status. */
export class AccountApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: Record<string, unknown> = {},
    readonly retryAfterMs = 0
  ) {
    super(`The account service answered HTTP ${status} (${code}).`)
    this.name = 'AccountApiError'
  }
  is(code: string): boolean {
    return this.code === code
  }
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

/**
 * The account service: `ATC_ACCOUNT_API_URL` overrides it for a local backend. Only https, or plain http on
 * this machine's loopback: tokens never cross a network unencrypted.
 */
export function accountApiBase(env: NodeJS.ProcessEnv | undefined): string {
  const raw = env?.['ATC_ACCOUNT_API_URL']?.trim()
  if (!raw) return ACCOUNT_API
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new AtcError('ATC_CONFIG_INVALID', 'ATC_ACCOUNT_API_URL is not a URL.')
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK.has(url.hostname)))
    throw new AtcError('ATC_CONFIG_INVALID', 'ATC_ACCOUNT_API_URL must be https, or http on 127.0.0.1.')
  return url.origin
}

export interface CallOptions {
  token?: string
  body?: unknown
  /** A long-poll waits this long on the server; the request may take that plus the usual timeout. */
  waitSeconds?: number
  /** Ends the request early: a host wakes its long-poll when something it reports changed. */
  signal?: AbortSignal
}

export type AccountCall = <T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options?: CallOptions
) => Promise<T>

/** Seconds of a `Retry-After` header as milliseconds; 0 when absent or not a number of seconds. */
function retryAfter(value: string | null): number {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0
}

function withTimeout(ms: number, signal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([timeout, signal]) : timeout
}

/** One JSON call to the account service; a 2xx answer's JSON, or `undefined` for an empty one. */
export function accountCaller(base: string, request: typeof fetch): AccountCall {
  return async <T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options: CallOptions = {}
  ): Promise<T> => {
    const headers: Record<string, string> = { accept: 'application/json' }
    if (options.token) headers['authorization'] = `Bearer ${options.token}`
    if (options.body !== undefined) headers['content-type'] = 'application/json'
    // A timeout or a refused connection is a plain error: the caller decides whether to retry.
    const response = await request(`${base}${path}`, {
      method,
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      redirect: 'error',
      signal: withTimeout(ACCOUNT_TIMEOUT_MS + (options.waitSeconds ?? 0) * 1000, options.signal),
    })
    const text = await response.text().catch(() => '')
    let json: unknown = undefined
    try {
      json = text ? JSON.parse(text) : undefined
    } catch {
      json = undefined
    }
    if (response.ok) return json as T
    const body =
      json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : {}
    const code =
      typeof body['error'] === 'string'
        ? body['error']
        : response.status === 401
          ? 'invalid_token'
          : `http_${response.status}`
    throw new AccountApiError(response.status, code, body, retryAfter(response.headers.get('retry-after')))
  }
}
