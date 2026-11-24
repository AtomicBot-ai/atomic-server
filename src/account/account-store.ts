/**
 * `<data>/atc/account.json` (0600, written whole through a temporary file): this install's id and its
 * session with the account service. Only the server process reads and writes it. The install id survives a
 * sign-out, so signing in again replaces this install's old session instead of adding a device.
 */
import { randomBytes } from 'node:crypto'

export interface AccountUser {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
}

export interface StoredSession {
  session_id: string
  access_token: string
  /** ms since the epoch */
  access_expires_at: number
  refresh_token: string
  user: AccountUser
}

export interface AccountDocument {
  version: 1
  installation_id: string
  session: StoredSession | null
}

/** The backend's token answer (`email/verify`, the device grant and refresh). */
export interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token: string
  session_id: string
  user: { id: string; email: string; display_name?: string | null; avatar_url?: string | null }
}

const INSTALLATION_ID = /^[A-Za-z0-9_-]{16,128}$/
/** Below this a token would be refreshed on every call (refresh starts two minutes early). */
const MIN_LIFETIME_S = 300
const MAX_LIFETIME_S = 24 * 3600

export const newInstallationId = (): string => randomBytes(32).toString('base64url')

const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const optionalText = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)

function parseUser(raw: unknown): AccountUser | null {
  if (!raw || typeof raw !== 'object') return null
  const user = raw as Record<string, unknown>
  if (!text(user['id']) || !text(user['email'])) return null
  return {
    id: user['id'],
    email: user['email'],
    display_name: optionalText(user['display_name']),
    avatar_url: optionalText(user['avatar_url']),
  }
}

function parseSession(raw: unknown): StoredSession | null {
  if (!raw || typeof raw !== 'object') return null
  const session = raw as Record<string, unknown>
  const user = parseUser(session['user'])
  if (
    !user ||
    !text(session['session_id']) ||
    !text(session['access_token']) ||
    !text(session['refresh_token']) ||
    typeof session['access_expires_at'] !== 'number'
  )
    return null
  return {
    session_id: session['session_id'],
    access_token: session['access_token'],
    access_expires_at: session['access_expires_at'],
    refresh_token: session['refresh_token'],
    user,
  }
}

/** A damaged or foreign file reads as signed out; a missing or bad install id is replaced. */
export function parseAccountDocument(raw: unknown, newId: () => string = newInstallationId): AccountDocument {
  const doc = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const id = doc['installation_id']
  const installationId = typeof id === 'string' && INSTALLATION_ID.test(id) ? id : newId()
  return {
    version: 1,
    installation_id: installationId,
    session: doc['version'] === 1 ? parseSession(doc['session']) : null,
  }
}

/** A session from a token answer; the lifetime is clamped to 5 minutes … 24 hours whatever the server says. */
export function sessionFromTokens(tokens: TokenResponse, now: number): StoredSession {
  const user = parseUser(tokens.user)
  if (!user || !text(tokens.access_token) || !text(tokens.refresh_token) || !text(tokens.session_id))
    throw new Error('The account service answered without a usable session.')
  const lifetime = Math.min(MAX_LIFETIME_S, Math.max(MIN_LIFETIME_S, Number(tokens.expires_in) || 0))
  return {
    session_id: tokens.session_id,
    access_token: tokens.access_token,
    access_expires_at: now + lifetime * 1000,
    refresh_token: tokens.refresh_token,
    user,
  }
}
