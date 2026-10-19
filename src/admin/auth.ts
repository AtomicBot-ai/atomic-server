/** Cookie sessions for the SPA: in memory, random ids, idle expiry. A restart logs everyone out. */

import { randomBytes } from 'node:crypto'
import { SESSION_COOKIE } from '../contract/index.js'

export const SESSION_IDLE_MS = 24 * 60 * 60 * 1000

export class SessionStore {
  private readonly sessions = new Map<string, number>()

  constructor(
    private readonly now: () => number = Date.now,
    private readonly idleMs: number = SESSION_IDLE_MS
  ) {}

  create(): string {
    const id = randomBytes(24).toString('base64url')
    this.sessions.set(id, this.now())
    return id
  }

  validate(id: string | undefined): boolean {
    if (!id) return false
    const last = this.sessions.get(id)
    if (last === undefined) return false
    if (this.now() - last > this.idleMs) {
      this.sessions.delete(id)
      return false
    }
    this.sessions.set(id, this.now())
    return true
  }

  revokeAll(): void {
    this.sessions.clear()
  }

  get size(): number {
    return this.sessions.size
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
