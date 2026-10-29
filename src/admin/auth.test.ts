import { describe, expect, it } from 'vitest'
import { noteToken, parseCookies, sessionCookie, SessionStore } from './auth.js'

describe('SessionStore', () => {
  it('validates live sessions, expires idle ones, revokes all', () => {
    let t = 0
    const store = new SessionStore(() => t, 100)
    const id = store.create()
    expect(store.validate(id)).toBe(true)
    t = 50
    expect(store.validate(id)).toBe(true)
    t = 200
    expect(store.validate(id)).toBe(false)
    const other = store.create()
    store.revokeAll()
    expect(store.validate(other)).toBe(false)
    expect(store.validate(undefined)).toBe(false)
  })

  it('revokes one id and leaves the other', () => {
    const store = new SessionStore(() => 0, 100)
    const kept = store.create()
    const dropped = store.create()
    store.revoke(undefined)
    store.revoke('missing')
    expect(store.size).toBe(2)
    store.revoke(dropped)
    expect(store.validate(dropped)).toBe(false)
    expect(store.validate(kept)).toBe(true)
    expect(store.size).toBe(1)
  })

  it('drops every session when the admin token changes, and not when it repeats', () => {
    const store = new SessionStore(() => 0, 100)
    store.create()
    const state: { issuedFor?: string } = {}
    noteToken(state, 'token-a', store)
    expect(store.size).toBe(1)
    noteToken(state, 'token-a', store)
    expect(store.size).toBe(1)
    noteToken(state, 'token-b', store)
    expect(store.size).toBe(0)
    expect(state.issuedFor).toBe('token-b')
  })
})

describe('cookies', () => {
  it('parses and formats', () => {
    expect(parseCookies('a=1; atc_session=x%20y; broken')).toEqual({ a: '1', atc_session: 'x y' })
    expect(sessionCookie('abc')).toBe('atc_session=abc; Path=/; HttpOnly; SameSite=Strict')
    expect(sessionCookie('abc', { secure: true })).toContain('; Secure')
  })
})

describe('SessionStore with a file', () => {
  it('keeps sessions across a restart, expires them by their last use, and empties the file on revoke', async () => {
    const { mkdtempSync, readFileSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'atc-sessions-'))
    try {
      const file = join(dir, 'run', 'admin-sessions.json')
      let t = 1000
      const first = new SessionStore(() => t, 100, file)
      const id = first.create()
      // A new store over the same file (the daemon after a restart) knows the session.
      const second = new SessionStore(() => t, 100, file)
      expect(second.validate(id)).toBe(true)
      t = 1150
      expect(new SessionStore(() => t, 100, file).validate(id)).toBe(false)
      t = 1000
      const third = new SessionStore(() => t, 100, file)
      third.create()
      third.revokeAll()
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ sessions: {} })
      expect(new SessionStore(() => t, 100, file).size).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
