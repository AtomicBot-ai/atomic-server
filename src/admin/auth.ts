/**
 * Cookie sessions for the SPA: random ids, idle expiry, kept in `atc/run/admin-sessions.json` when a
 * file is given, so a restart of the server does not log every browser out. The file sits beside the
 * admin token, in the folder restricted to the owner.
 */

import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { dirname } from 'node:path'
import { SESSION_COOKIE } from '../contract/index.js'
import { tokensMatch } from './token.js'

export const SESSION_IDLE_MS = 24 * 60 * 60 * 1000
/** A validation only touches the file when the last use moved by this much: not on every request. */
const TOUCH_WRITE_MS = 60 * 1000

export class SessionStore {
  private readonly sessions = new Map<string, number>()

  constructor(
    private readonly now: () => number = Date.now,
    private readonly idleMs: number = SESSION_IDLE_MS,
    private readonly file?: string
  ) {
    if (file) this.load(file)
  }

  create(): string {
    const id = randomBytes(24).toString('base64url')
    this.sessions.set(id, this.now())
    this.save()
    return id
  }

  validate(id: string | undefined): boolean {
    if (!id) return false
    const last = this.sessions.get(id)
    if (last === undefined) return false
    const now = this.now()
    if (now - last > this.idleMs) {
      this.sessions.delete(id)
      this.save()
      return false
    }
    this.sessions.set(id, now)
    if (now - last >= TOUCH_WRITE_MS) this.save()
    return true
  }

  revoke(id: string | undefined): void {
    if (!id || !this.sessions.has(id)) return
    this.sessions.delete(id)
    this.save()
  }

  revokeAll(): void {
    this.sessions.clear()
    this.save()
  }

  get size(): number {
    return this.sessions.size
  }

  private load(file: string): void {
    try {
      const doc = JSON.parse(readFileSync(file, 'utf8')) as { sessions?: Record<string, unknown> }
      const now = this.now()
      for (const [id, last] of Object.entries(doc.sessions ?? {}))
        if (typeof last === 'number' && now - last <= this.idleMs) this.sessions.set(id, last)
    } catch {
      // No file yet, or one this build cannot read: everyone signs in again.
    }
  }

  private save(): void {
    if (!this.file) return
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      writeFileSync(this.file, JSON.stringify({ sessions: Object.fromEntries(this.sessions) }), {
        mode: 0o600,
      })
    } catch {
      // The sessions still work until the next restart.
    }
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim())
  }
  return out
}

export function sessionCookie(id: string, options: { secure?: boolean } = {}): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=Strict${options.secure ? '; Secure' : ''}`
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
}

/** Drop every session when the admin token this process last saw has changed. */
export function noteToken(state: { issuedFor?: string }, token: string, sessions: SessionStore): void {
  if (state.issuedFor !== undefined && state.issuedFor !== token) sessions.revokeAll()
  state.issuedFor = token
}

/** Cookie or bearer, after noticing a rotated admin token. */
export async function adminAuthorised(
  req: Pick<IncomingMessage, 'headers'>,
  deps: { sessions: SessionStore; adminToken: () => Promise<string> },
  state: { issuedFor?: string }
): Promise<boolean> {
  const token = await deps.adminToken()
  noteToken(state, token, deps.sessions)
  const cookie = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1]
  return deps.sessions.validate(cookie) || (bearer !== undefined && tokensMatch(bearer, token))
}
