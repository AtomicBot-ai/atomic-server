/**
 * The admin BFF over `fetch`: JSON in and out, the session cookie, `x-atc-admin: 1` on every
 * mutation, and the BFF's `{ error: { code, message, details, hint } }` body surfaced as an
 * `AdminApiError` (which also has the `{ code, message, details }` shape the app's core client
 * recognises).
 */

import { ADMIN_API, ADMIN_HEADER } from '@contract'
import type { AdminConfigView, AdminErrorBody, AdminStatus } from '@contract'
import { AdminApiError } from './admin-error'
import { reportClientFailure } from './error-reporting'
export { AdminApiError } from './admin-error'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export const ADMIN_BASE = '/api'

/** The BFF answered 401: there is no session, show the sign-in screen. */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof AdminApiError && error.status === 401
}

export function describeError(error: unknown): string {
  reportClientFailure(error)
  if (error instanceof AdminApiError) return error.hint ? `${error.message} (${error.hint})` : error.message
  if (error instanceof Error) return error.message
  return String(error)
}

function isErrorBody(value: unknown): value is AdminErrorBody {
  const error = (value as Partial<AdminErrorBody> | undefined)?.error
  return (
    !!error &&
    typeof error === 'object' &&
    typeof error.code === 'string' &&
    typeof error.message === 'string'
  )
}

/** `/api/status` → `/status`, so the routes stay one source of truth whatever base the caller uses. */
export function relative(route: string): string {
  return route.startsWith(ADMIN_BASE) ? route.slice(ADMIN_BASE.length) : route
}

export async function request<T>(method: HttpMethod, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' }
  const init: RequestInit = { method, credentials: 'same-origin', headers }
  if (method !== 'GET') {
    headers[ADMIN_HEADER] = '1'
    if (body !== undefined && body !== null) {
      headers['content-type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
  }
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new AdminApiError('ADMIN_UNREACHABLE', `The admin API did not answer: ${reason}`, {
      hint: 'is `atc` running?',
    })
  }
  const text = response.status === 204 ? '' : await response.text()
  let parsed: unknown
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = undefined
    }
  }
  if (!response.ok) {
    if (isErrorBody(parsed)) {
      throw new AdminApiError(parsed.error.code, parsed.error.message, {
        status: response.status,
        details: parsed.error.details,
        hint: parsed.error.hint,
      })
    }
    throw new AdminApiError('ADMIN_HTTP_ERROR', `${method} ${url} failed with HTTP ${response.status}.`, {
      status: response.status,
      details: text.slice(0, 200) || undefined,
    })
  }
  return parsed as T
}

export interface AdminApi {
  status(): Promise<AdminStatus>
  config(): Promise<AdminConfigView>
  login(token: string): Promise<void>
  logout(): Promise<void>
}

export function createAdminApi(base = ADMIN_BASE): AdminApi {
  const url = (route: string) => `${base}${relative(route)}`
  return {
    status: () => request<AdminStatus>('GET', url(ADMIN_API.status)),
    config: () => request<AdminConfigView>('GET', url(ADMIN_API.config)),
    login: (token) => request<void>('POST', url(ADMIN_API.session), { token }),
    logout: () => request<void>('DELETE', url(ADMIN_API.session)),
  }
}
