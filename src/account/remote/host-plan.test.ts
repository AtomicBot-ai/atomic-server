import { describe, expect, it } from 'vitest'
import { pendingRequests, planHost, PAIRING_GRACE_MS } from './host-plan.js'
import { b64u, codeSecret, pairProof } from './protocol.js'
import type { HostGrant, HostSync } from './remote-api.js'
import { emptyRemote, type RemoteDocument } from './remote-store.js'

const DEVICE_PUBLIC = 'B6N8vBQgk8i3VdwbEOhstCY3StFqqFPtC9_AsrhtHHw'
const QR = new Uint8Array(32).fill(7)
const CODE_PROOF = pairProof(codeSecret('BCDFGHJK'), DEVICE_PUBLIC)
const QR_PROOF = pairProof(QR, DEVICE_PUBLIC)
const NOW = 1_000_000

const grant = (id: string, status: string, method: string, proof: string | null = null): HostGrant => ({
  id,
  status,
  method,
  client: { id: 'device-1', client_type: 'mobile', device_name: "Ann's iPhone", platform: 'ios' },
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
const file = (patch: Partial<RemoteDocument> = {}): RemoteDocument => ({
  ...emptyRemote(),
  pairing: { code: 'BCDFGHJK', qr_secret: b64u(QR), expires_at: NOW + 60_000 },
  ...patch,
})
const issued = (grant_id: string) => ({
  grant_id,
  client_device_id: 'device-1',
  client_name: null,
  client_platform: null,
  api_key: 'atc_x',
  grant_secret: 'g',
  issued_at: 0,
})

describe('planHost', () => {
  it.each([
    ['a typed code', CODE_PROOF, codeSecret('BCDFGHJK')],
    ['a QR link', QR_PROOF, QR],
  ])('issues a key with a MAC to a device that proves %s', (_name, proof, secret) => {
    const plan = planHost(sync(grant('g1', 'approved', 'code', proof)), file(), NOW)
    expect(plan.issue).toHaveLength(1)
    expect(plan.issue[0]!.mac_secret).toEqual(secret)
    // The code is cleared once the key is out, by the round, not by the plan.
    expect(plan.clear_pairing).toBe(false)
    expect(plan.deny).toEqual([])
  })

  it.each([
    ['a wrong proof', file(), pairProof(new Uint8Array(32), DEVICE_PUBLIC)],
    ['no proof', file(), null],
    ['no open code', file({ pairing: null }), CODE_PROOF],
    [
      'a code past its grace',
      file({ pairing: { code: 'BCDFGHJK', qr_secret: b64u(QR), expires_at: NOW - PAIRING_GRACE_MS - 1 } }),
      CODE_PROOF,
    ],
  ])('denies a code pairing with %s', (_name, document, proof) => {
    const plan = planHost(sync(grant('g1', 'approved', 'code', proof)), document, NOW)
    expect(plan.deny).toEqual(['g1'])
    expect(plan.issue).toEqual([])
  })

  it('still honours a code shortly after it expired', () => {
    const late = file({ pairing: { code: 'BCDFGHJK', qr_secret: b64u(QR), expires_at: NOW - 60_000 } })
    expect(planHost(sync(grant('g1', 'approved', 'code', CODE_PROOF)), late, NOW).issue).toHaveLength(1)
  })

  const allowed = (grant_id: string, client_public_key = DEVICE_PUBLIC) => ({
    grant_id,
    client_device_id: 'device-1',
    client_public_key,
    allowed_at: NOW,
  })

  it('issues a request allowed here without a MAC, and leaves a pending one alone', () => {
    const plan = planHost(
      sync(grant('g1', 'approved', 'request'), grant('g2', 'pending', 'request')),
      file({ allowed: [allowed('g1')] }),
      NOW
    )
    expect(plan.issue.map((o) => [o.grant_id, o.mac_secret])).toEqual([['g1', null]])
    expect(plan.deny).toEqual([])
  })

  it.each([
    ['nobody allowed here', file()],
    ['another grant was allowed', file({ allowed: [allowed('g9')] })],
    ['the device changed its key after the check code', file({ allowed: [allowed('g1', 'A'.repeat(43))] })],
  ])('denies an approved request when %s', (_name, document) => {
    const plan = planHost(sync(grant('g1', 'approved', 'request')), document, NOW)
    expect(plan.issue).toEqual([])
    expect(plan.deny).toEqual(['g1'])
  })

  it('denies an approved grant of a method it does not know', () => {
    const plan = planHost(sync(grant('g1', 'approved', 'anything', CODE_PROOF)), file(), NOW)
    expect(plan.deny).toEqual(['g1'])
  })

  it('cleans names from other devices before showing them', () => {
    const named = { ...grant('g1', 'pending', 'request') }
    named.client = { ...named.client, device_name: 'Mac\u001b]52;c;aGk=\u0007Book' }
    expect(pendingRequests(sync(named))[0]!.device_name).toBe('Mac]52;c;aGk=Book')
  })

  it('revokes an active grant it holds no key for, and drops keys of grants that ended', () => {
    const plan = planHost(
      sync(grant('g1', 'active', 'request'), grant('g2', 'active', 'request')),
      file({ issued: [issued('g1'), issued('gone')] }),
      NOW
    )
    expect(plan.revoke_unknown).toEqual(['g2'])
    expect(plan.dropped).toEqual(['gone'])
  })

  it('lists pending requests with their check codes', () => {
    expect(pendingRequests(sync(grant('g1', 'pending', 'request')))).toEqual([
      {
        grant_id: 'g1',
        device_name: "Ann's iPhone",
        platform: 'ios',
        client_type: 'mobile',
        check_code: expect.stringMatching(/^\d{6}$/),
        created_at: '2026-11-12T10:00:00Z',
      },
    ])
  })
})
