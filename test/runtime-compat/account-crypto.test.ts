import { expect, it } from 'vitest'
import { qrTerminal } from '../../src/account/qr.js'
import {
  devicePublicKey,
  newDeviceSecret,
  pairProof,
  sas,
  unb64u,
} from '../../src/account/remote/protocol.js'
import {
  endpointsKey,
  openCredential,
  openEndpoints,
  sealCredential,
  sealEndpoints,
} from '../../src/account/remote/sealed.js'

// The backend's reference values (tests/remote_protocol.py): the binary must make and open the same bytes.
const DEVICE_SECRET = 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA'
const DEVICE_PUBLIC = 'B6N8vBQgk8i3VdwbEOhstCY3StFqqFPtC9_AsrhtHHw'
const GRANT_ID = '6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b'

it('derives X25519 keys, HMAC proofs, HKDF keys and check codes the backend agrees with', () => {
  expect(devicePublicKey(DEVICE_SECRET)).toBe(DEVICE_PUBLIC)
  expect(pairProof(new TextEncoder().encode('BCDFGHJK'), DEVICE_PUBLIC)).toBe(
    'f0KsN1PXKVZmYj-zk_SoZbLrdomMpCMjdYpcbFPqu58'
  )
  expect(
    Buffer.from(endpointsKey(unb64u('yMnKy8zNzs_Q0dLT1NXW19jZ2tvc3d7f4OHi4-Tl5uc'))).toString('base64url')
  ).toBe('daUPG-dulL_L_fdJ_H5zmxRckkR78mxLhstfUgcb5E0')
  expect(
    sas('0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', '11111111-2222-4333-8444-555555555555', DEVICE_PUBLIC)
  ).toBe('936468')
})

it('seals and opens an HPKE envelope and a ChaCha20-Poly1305 blob', async () => {
  const secret = newDeviceSecret()
  const grantSecret = new Uint8Array(32).fill(9)
  const credential = { v: 1 as const, api_key: 'atc_key', grant_secret: 'x'.repeat(43), host_name: 'Lab' }
  const envelope = await sealCredential(devicePublicKey(secret), GRANT_ID, {
    ...credential,
    grant_secret: Buffer.from(grantSecret).toString('base64url'),
  })
  expect((await openCredential(secret, GRANT_ID, envelope)).api_key).toBe('atc_key')
  const blob = await sealEndpoints(grantSecret, GRANT_ID, 4, [
    { kind: 'lan', url: 'http://10.0.0.2:1339/v1' },
  ])
  expect((await openEndpoints(grantSecret, GRANT_ID, blob)).seq).toBe(4)
})

it('draws a pairing link as a terminal QR code', () => {
  const rows = qrTerminal('atomic-chat://remote/pair?c=BCDF-GHJK&k=AAAA').split('\n')
  expect(rows.length).toBeGreaterThan(10)
  expect(new Set(rows.map((r) => [...r].length)).size).toBe(1)
})
