import { describe, expect, it, vi } from 'vitest'
import { AccountApiError } from '../account-api.js'
import type { AccountSession } from '../session.js'
import { endGrants, grantsOf, grantsToEnd, type StopContext } from './host-stop.js'
import type { HostSync, RemoteApi } from './remote-api.js'

const grant = (id: string, status: string) => ({ id, status }) as HostSync['grants'][number]
const sync = (...grants: HostSync['grants']): HostSync => ({
  host: { id: 'h', name: 'Lab' },
  state_version: 1,
  grants,
  pairing_code: null,
})

function context(api: Partial<RemoteApi>): StopContext {
  const session = { authed: (work: (token: string) => unknown) => work('t') } as unknown as AccountSession
  return { session, api: api as RemoteApi, log: { info: () => {}, warn: () => {} } }
}

describe('ending every grant when sharing stops', () => {
  it('denies requests and revokes approved and active grants, from the service’s own list', async () => {
    expect(grantsOf(sync(grant('p', 'pending'), grant('a', 'approved'), grant('x', 'active')))).toEqual({
      pending: ['p'],
      live: ['a', 'x'],
    })
    const ctx = context({ sync: vi.fn(async () => sync(grant('x', 'active'))) })
    expect(await grantsToEnd(ctx, { pending: ['old'], live: [] })).toEqual({ pending: [], live: ['x'] })
  })

  it('falls back to what this server knew when the service cannot list them', async () => {
    const ctx = context({ sync: vi.fn(async () => Promise.reject(new AccountApiError(503, 'http_503'))) })
    expect(await grantsToEnd(ctx, { pending: ['p'], live: ['k'] })).toEqual({ pending: ['p'], live: ['k'] })
  })

  it('revokes a request approved meanwhile, ignores grants already gone, and reports the rest', async () => {
    const decide = vi.fn(async () => Promise.reject(new AccountApiError(409, 'invalid_state')))
    const revokeGrant = vi.fn(async (_token: string, id: string) => {
      if (id === 'gone') throw new AccountApiError(404, 'grant_not_found')
      if (id === 'down') throw new AccountApiError(503, 'http_503')
    })
    const failure = await endGrants(context({ decide, revokeGrant }), {
      pending: ['p'],
      live: ['gone', 'down', 'x'],
    })
    expect(decide).toHaveBeenCalledWith('t', 'p', false)
    expect(revokeGrant.mock.calls.map(([, id]) => id)).toEqual(['p', 'gone', 'down', 'x'])
    expect(failure).toMatchObject({ status: 503 })
  })
})
