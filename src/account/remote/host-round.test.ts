import { describe, expect, it } from 'vitest'
import type { AccountSession } from '../session.js'
import { applySync, type RoundContext } from './host-round.js'
import { roundSettled } from './host-stop.js'
import { b64u, codeSecret, pairProof } from './protocol.js'
import type { HostGrant, HostSync } from './remote-api.js'
import { emptyRemote, type RemoteDocument } from './remote-store.js'

const DEVICE_PUBLIC = 'B6N8vBQgk8i3VdwbEOhstCY3StFqqFPtC9_AsrhtHHw'
const NOW = 1_000_000

const grant = (id: string, status: string, method = 'request', proof: string | null = null): HostGrant => ({
  id,
  status,
  method,
  client: { id: `device-${id}`, client_type: 'mobile', device_name: "Ann's iPhone", platform: 'ios' },
  client_public_key: DEVICE_PUBLIC,
  proof,
  needs_credential: status === 'approved',
  credential_collected: false,
  created_at: '2026-11-12T10:00:00Z',
  decided_at: null,
})
const sync = (...grants: HostGrant[]): HostSync => ({
  host: { id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', name: 'Lab' },
  state_version: 3,
  grants,
  pairing_code: null,
})
const REACH = { tunnel: 'off' as const, lan: false, endpoints: [] }

/**
 * A round context over an in-memory document and a recording API. `onCall` and `onWrite` run inside the call
 * or the write, which is where a stop lands in real life.
 */
function harness(
  document: RemoteDocument,
  hooks: { onCall?: (call: string) => void; onWrite?: (next: RemoteDocument) => void } = {}
) {
  const calls: string[] = []
  let doc = document
  const record = (call: string) => {
    calls.push(call)
    hooks.onCall?.(call)
    return Promise.resolve()
  }
  const api = {
    decide: (_t: string, id: string, allow: boolean) => record(`decide ${id} ${allow}`),
    revokeGrant: (_t: string, id: string) => record(`revoke ${id}`),
    uploadCredential: (_t: string, id: string) => record(`credential ${id}`),
    uploadEndpoints: () => record('endpoints'),
  }
  const ctx: RoundContext = {
    session: {
      authed: (work: (token: string) => Promise<unknown>) => work('token'),
    } as unknown as AccountSession,
    api: api as unknown as RoundContext['api'],
    hostName: () => 'Lab',
    update: async (change) => {
      const next = change(doc)
      if (next !== doc) hooks.onWrite?.(next)
      doc = next
      return doc
    },
    now: () => NOW,
    log: { info: () => {}, warn: () => {} },
  }
  return { ctx, calls, document: () => doc }
}

describe('applySync once its round is stopped', () => {
  it('starts nothing when the stop came before it acted', async () => {
    const stop = new AbortController()
    stop.abort()
    const { ctx, calls, document } = harness({ ...emptyRemote(), sharing: true })
    const before = document()

    await expect(applySync(ctx, sync(grant('g1', 'active')), REACH, null, stop.signal)).rejects.toMatchObject(
      {
        name: 'AbortError',
      }
    )
    expect(calls).toEqual([])
    expect(document()).toBe(before)
  })

  it('finishes the call in flight and starts no other', async () => {
    const stop = new AbortController()
    // Two active grants with no key here: the round would revoke both.
    const { ctx, calls } = harness(
      { ...emptyRemote(), sharing: true },
      { onCall: (call) => call.startsWith('revoke') && stop.abort() }
    )

    await expect(
      applySync(ctx, sync(grant('g1', 'active'), grant('g2', 'active')), REACH, null, stop.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(calls).toEqual(['revoke g1'])
  })

  it('sends no key the stop caught being written, and takes it back', async () => {
    const stop = new AbortController()
    const proof = pairProof(codeSecret('BCDFGHJK'), DEVICE_PUBLIC)
    const { ctx, calls, document } = harness(
      {
        ...emptyRemote(),
        sharing: true,
        pairing: { code: 'BCDFGHJK', qr_secret: b64u(new Uint8Array(32).fill(7)), expires_at: NOW + 60_000 },
      },
      { onWrite: (next) => next.issued.length > 0 && stop.abort() }
    )

    await expect(
      applySync(ctx, sync(grant('g1', 'approved', 'code', proof)), REACH, null, stop.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(calls).toEqual([])
    expect(document().issued).toEqual([])
  })

  it('acts as before without a stop', async () => {
    const { ctx, calls } = harness({ ...emptyRemote(), sharing: true })

    await applySync(ctx, sync(grant('g1', 'active'), grant('g2', 'active')), REACH, null)
    expect(calls).toEqual(['revoke g1', 'revoke g2'])
  })
})

describe('roundSettled', () => {
  it('returns as soon as the round has ended', async () => {
    const order: string[] = []
    let end!: () => void
    const ended = new Promise<void>((resolve) => (end = resolve))
    const settled = roundSettled(ended, 60_000).then(() => order.push('settled'))
    order.push('ending')
    end()
    await settled
    expect(order).toEqual(['ending', 'settled'])
  })

  it('stops waiting after its bound for a round that never ends', async () => {
    const started = Date.now()
    await roundSettled(new Promise<void>(() => {}), 20)
    expect(Date.now() - started).toBeLessThan(5_000)
  })
})
