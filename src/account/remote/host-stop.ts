/**
 * Stopping sharing ends every device's access. The caller drops the keys here first; this then ends each live
 * grant on the account service — a pending request is denied, an approved or active grant revoked — so every
 * device learns it at once and pairs again next time. The host record stays: sharing again sends no new
 * "new computer" email.
 */
import { AccountApiError } from '../account-api.js'
import type { AccountSession } from '../session.js'
import { REMOTE_CODES, type HostSync, type RemoteApi } from './remote-api.js'

export interface StopContext {
  session: AccountSession
  api: RemoteApi
  log: { info(message: string): void; warn(message: string): void }
}

/** The grants a stop ends: requests to deny, and approved or active grants to revoke. */
export interface GrantsToEnd {
  pending: string[]
  live: string[]
}

/** The live grants in one sync answer. */
export const grantsOf = (sync: HostSync): GrantsToEnd => ({
  pending: sync.grants.filter((g) => g.status === 'pending').map((g) => g.id),
  live: sync.grants.filter((g) => g.status === 'approved' || g.status === 'active').map((g) => g.id),
})

/**
 * What the account service lists for this host now, asked without waiting; what this server knew when the
 * service cannot answer (no host, no network).
 */
export async function grantsToEnd(ctx: StopContext, known: GrantsToEnd): Promise<GrantsToEnd> {
  try {
    const sync = await ctx.session.authed((token) =>
      ctx.api.sync(token, { after: null, wait: 0, tunnel: 'off', lan: false })
    )
    return grantsOf(sync)
  } catch {
    return known
  }
}

/** "This grant ended meanwhile": nothing left to end. */
const gone = (error: unknown) => error instanceof AccountApiError && error.is(REMOTE_CODES.GRANT_NOT_FOUND)

/** Deny every request and revoke every live grant; the first failure comes back after trying them all. */
export async function endGrants(ctx: StopContext, grants: GrantsToEnd): Promise<unknown> {
  let first: unknown = null
  const keep = (error: unknown) => {
    if (!gone(error)) first ??= error
  }
  const revoke = (id: string) => ctx.session.authed((token) => ctx.api.revokeGrant(token, id)).catch(keep)
  for (const id of grants.pending)
    await ctx.session
      .authed((token) => ctx.api.decide(token, id, false))
      // Approved meanwhile: revoking still ends it.
      .catch((error: unknown) =>
        error instanceof AccountApiError && error.is(REMOTE_CODES.INVALID_STATE) ? revoke(id) : keep(error)
      )
  for (const id of grants.live) await revoke(id)
  if (grants.pending.length + grants.live.length > 0)
    ctx.log.info(
      `remote: sharing stopped; ended ${grants.live.length} device grants and ${grants.pending.length} requests`
    )
  return first
}
