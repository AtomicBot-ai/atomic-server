/**
 * The account session this server holds: one refresh at a time, a refresh shortly before the access token
 * expires, and one refresh-and-retry when a call is refused with 401. A refused refresh (`invalid_grant`)
 * ends the session; a network failure keeps it for the next try.
 */
import { join } from 'node:path'
import { readDocument, writeDocument } from '../terminal-data/index.js'
import { AccountApiError, type AccountCall } from './account-api.js'
import {
  parseAccountDocument,
  sessionFromTokens,
  type AccountDocument,
  type AccountUser,
  type TokenResponse,
} from './account-store.js'

/** Refresh this long before the access token expires. */
const REFRESH_EARLY_MS = 120_000
/** How long a sign-out waits for the service before it forgets the session anyway. */
const LOGOUT_WAIT_MS = 5_000

export type AccountChange = 'signedIn' | 'signedOut' | 'sessionLost'

export interface AccountSessionOptions {
  atcDir: string
  call: AccountCall
  now?: () => number
}

export class AccountSession {
  readonly path: string
  private document: AccountDocument | null = null
  private loading: Promise<AccountDocument> | null = null
  private refreshing: Promise<string> | null = null
  /** Bumped by every change of the session: a refresh that started before one never overwrites it. */
  private generation = 0
  private readonly listeners = new Set<(change: AccountChange) => void>()
  constructor(private readonly options: AccountSessionOptions) {
    this.path = join(options.atcDir, 'account.json')
  }
  private now(): number {
    return (this.options.now ?? Date.now)()
  }
  load(): Promise<AccountDocument> {
    if (this.document) return Promise.resolve(this.document)
    this.loading ??= readDocument<unknown>(this.path, null)
      .then(
        async (raw) => {
          const document = parseAccountDocument(raw)
          // A new install id is kept at once: a sign-in must never run under two different ids.
          if ((raw as { installation_id?: unknown } | null)?.installation_id !== document.installation_id)
            await writeDocument(this.path, document)
          return document
        },
        // A file that cannot be read is left alone: signed out here, and written only by a new sign-in.
        () => parseAccountDocument(null)
      )
      .then((document) => {
        this.document = document
        return document
      })
      .finally(() => {
        this.loading = null
      })
    return this.loading
  }
  /** It counts in memory first: a rotated refresh token must not be lost to a failed write. */
  private async save(document: AccountDocument): Promise<void> {
    this.document = document
    this.generation += 1
    await writeDocument(this.path, document)
  }
  /** Who is signed in, as last read; null before the first read or when signed out. */
  user(): AccountUser | null {
    return this.document?.session?.user ?? null
  }
  signedIn(): boolean {
    return Boolean(this.document?.session)
  }
  onChange(listener: (change: AccountChange) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  private emit(change: AccountChange): void {
    for (const listener of this.listeners) listener(change)
  }
  /** Keep the session a sign-in just returned. */
  async adopt(tokens: TokenResponse): Promise<AccountUser> {
    const document = await this.load()
    const session = sessionFromTokens(tokens, this.now())
    await this.save({ ...document, session })
    this.emit('signedIn')
    return session.user
  }
  /** Forget the session; the install id stays. */
  private async clear(change: AccountChange): Promise<void> {
    const document = await this.load()
    if (!document.session) return
    await this.save({ ...document, session: null })
    this.emit(change)
  }
  /**
   * Tell the service, with a fresh token if needed (best effort, a few seconds at most), then forget the
   * session either way. True when the service confirmed it: only then are the session, the host and every
   * device's grant over there too.
   */
  async signOut(): Promise<boolean> {
    if (!(await this.load()).session) return false
    const confirmed = await Promise.race([
      this.authed((token) => this.options.call('POST', '/v1/auth/logout', { token })).then(
        () => true,
        () => false
      ),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), LOGOUT_WAIT_MS).unref?.()),
    ])
    await this.clear('signedOut')
    return confirmed
  }
  /** A valid access token: refreshed first when it expires within two minutes. */
  async accessToken(): Promise<string> {
    const session = (await this.load()).session
    if (!session) throw new AccountApiError(401, 'not_signed_in')
    if (session.access_expires_at - this.now() > REFRESH_EARLY_MS) return session.access_token
    return this.refresh(session.access_token)
  }
  /**
   * One refresh at a time. `rejected` is the token a caller saw refused: when another caller already
   * replaced it, that newer token is the answer and no second refresh runs.
   */
  refresh(rejected: string): Promise<string> {
    const current = this.document?.session
    if (!current) return Promise.reject(new AccountApiError(401, 'not_signed_in'))
    if (current.access_token !== rejected && current.access_expires_at - this.now() > REFRESH_EARLY_MS)
      return Promise.resolve(current.access_token)
    const generation = this.generation
    this.refreshing ??= (async () => {
      try {
        const tokens = await this.options.call<TokenResponse>('POST', '/v1/auth/token', {
          body: { grant_type: 'refresh_token', refresh_token: current.refresh_token },
        })
        // Signed out or in again meanwhile: these tokens belong to a session that is gone here.
        if (this.generation !== generation) throw new AccountApiError(401, 'not_signed_in')
        const document = await this.load()
        const session = sessionFromTokens(tokens, this.now())
        await this.save({ ...document, session })
        return session.access_token
      } catch (error) {
        // The service refused the refresh token itself: this session is over. Anything else keeps it.
        if (
          error instanceof AccountApiError &&
          (error.is('invalid_grant') || error.status === 401) &&
          this.generation === generation
        ) {
          await this.clear('sessionLost')
          throw new AccountApiError(401, 'invalid_grant')
        }
        throw error
      }
    })().finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }
  /** Run `work` with an access token; on 401, one refresh and one retry. */
  async authed<T>(work: (token: string) => Promise<T>): Promise<T> {
    const token = await this.accessToken()
    try {
      return await work(token)
    } catch (error) {
      if (!(error instanceof AccountApiError) || error.status !== 401 || error.is('invalid_grant'))
        throw error
      return work(await this.refresh(token))
    }
  }
}
