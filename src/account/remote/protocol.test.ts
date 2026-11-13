import { describe, expect, it } from 'vitest'
import {
  b64u,
  codeSecret,
  devicePublicKey,
  formatCode,
  newDeviceApiKey,
  newDeviceSecret,
  newGrantSecret,
  normalizeCode,
  pairLink,
  pairProof,
  ProtocolError,
  sas,
  unb64u,
  verifyPairProof,
} from './protocol.js'
import {
  credentialMac,
  endpointsKey,
  isDialableUrl,
  openCredential,
  openEndpoints,
  sealCredential,
  sealEndpoints,
  verifyCredentialMac,
  type Credential,
} from './sealed.js'

// Produced by atomic-chat-backend `tests/remote_protocol.py` (2026-11-12), the same vectors as the desktop
// app's `protocol.rs`: device secret = bytes 1..=32, qr secret = bytes 100..=131, grant secret = 200..=231.
const DEVICE_SECRET = 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA'
const DEVICE_PUBLIC = 'B6N8vBQgk8i3VdwbEOhstCY3StFqqFPtC9_AsrhtHHw'
const GRANT_ID = '6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b'
const HOST_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const CLIENT_DEVICE_ID = '11111111-2222-4333-8444-555555555555'
const CODE = 'BCDF-GHJK'
const CODE_PROOF = 'f0KsN1PXKVZmYj-zk_SoZbLrdomMpCMjdYpcbFPqu58'
const QR_SECRET = 'ZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXp7fH1-f4CBgoM'
const QR_PROOF = '4Nb-6qlYKuKMhF7L_C55WD2hzM0_-swcTzvL0Yaf8AU'
const ENVELOPE =
  'Rni3WWzYOmGfKSZRDhlpL-lYD7j7o92Eu6jhF7mEEA1Na-eF6UhCl9d8XhJnFfPEtrLj-4qN6p7mdRiS2DBk4RCGwykVCxhognvxY1p0aReHpAfpwaNxYAYho87_XXt0WV8dL2Ij_9VB3-tuuDU18ZkfLuz3Eiw3RYGrkgeBACmAmIvw26elTOO9ZKXzfK5fCp83UdfjNc5EUGDMH2rloiG5BZSQZMxPfo14qBtsRn9D-6Q'
const CODE_MAC = 'ez1CtfWZ9mhme0ubEXcFldK4E3j30b0IDYk3A7_LMmI'
const QR_MAC = 'qs83HPxlQv_ynJjYg0ublOFwYWcQAq2-dJM450I5kYE'
const GRANT_SECRET = 'yMnKy8zNzs_Q0dLT1NXW19jZ2tvc3d7f4OHi4-Tl5uc'
const ENDPOINTS_KEY = 'daUPG-dulL_L_fdJ_H5zmxRckkR78mxLhstfUgcb5E0'
const BLOB =
  '956G7mQb8mp4lbCnqJTFwU1n3bqXWNRpaMtRMvrida5ZdqJVh-DgjTZSMJITpcTNLV3fhbAFGHu8LRtERd8beVX0i6C_LNunSO5SnEdVl3mP2AUh73-q6fhKlw_wd-dU-pspw1C25Fe_tfEcTBINDAB_ShC0GWa6359tyU4hwni6xjx7OIan54R2e2qOUoZPmyednsi2vE6MTnLVPXZ7kj_MFP2gzADlNWmGbm_MOLIfyMnWD2lK4f8'
const SAS = '936468'

const codeKey = () => codeSecret(normalizeCode(CODE)!)

describe('the remote access protocol', () => {
  it('derives the reference public key', () => {
    expect(devicePublicKey(DEVICE_SECRET)).toBe(DEVICE_PUBLIC)
    expect(devicePublicKey(newDeviceSecret())).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('makes the reference proofs and checks them in constant time', () => {
    expect(pairProof(codeKey(), DEVICE_PUBLIC)).toBe(CODE_PROOF)
    const qr = unb64u(QR_SECRET)
    expect(pairProof(qr, DEVICE_PUBLIC)).toBe(QR_PROOF)
    expect(verifyPairProof(qr, DEVICE_PUBLIC, QR_PROOF)).toBe(true)
    expect(verifyPairProof(qr, DEVICE_PUBLIC, CODE_PROOF)).toBe(false)
    expect(verifyPairProof(qr, DEVICE_PUBLIC, 'not base64!')).toBe(false)
  })

  it('opens a reference envelope and makes its MACs', async () => {
    const credential = await openCredential(DEVICE_SECRET, GRANT_ID, ENVELOPE)
    expect(credential).toEqual({
      v: 1,
      api_key: 'sk-atomic-test-key',
      grant_secret: GRANT_SECRET,
      host_name: 'Studio Mac',
    })
    expect(credentialMac(codeKey(), GRANT_ID, ENVELOPE)).toBe(CODE_MAC)
    expect(credentialMac(unb64u(QR_SECRET), GRANT_ID, ENVELOPE)).toBe(QR_MAC)
    expect(verifyCredentialMac(codeKey(), GRANT_ID, ENVELOPE, CODE_MAC)).toBe(true)
    expect(verifyCredentialMac(codeKey(), GRANT_ID, ENVELOPE, QR_MAC)).toBe(false)
  })

  it('refuses an envelope for another grant or key', async () => {
    await expect(openCredential(DEVICE_SECRET, `${GRANT_ID.slice(0, -1)}c`, ENVELOPE)).rejects.toEqual(
      new ProtocolError('crypto')
    )
    await expect(openCredential(newDeviceSecret(), GRANT_ID, ENVELOPE)).rejects.toEqual(
      new ProtocolError('crypto')
    )
    await expect(openCredential(DEVICE_SECRET, GRANT_ID, 'AAAA')).rejects.toEqual(
      new ProtocolError('encoding')
    )
  })

  it('seals a credential the device can open, fresh every time', async () => {
    const secret = newDeviceSecret()
    const credential: Credential = {
      v: 1,
      api_key: newDeviceApiKey(),
      grant_secret: newGrantSecret(),
      host_name: 'Lab server',
    }
    const envelope = await sealCredential(devicePublicKey(secret), GRANT_ID, credential)
    await expect(openCredential(secret, GRANT_ID, envelope)).resolves.toEqual(credential)
    expect(await sealCredential(devicePublicKey(secret), GRANT_ID, credential)).not.toBe(envelope)
  })

  it('derives the reference endpoints key and opens its blob', async () => {
    const secret = unb64u(GRANT_SECRET)
    expect(b64u(endpointsKey(secret))).toBe(ENDPOINTS_KEY)
    await expect(openEndpoints(secret, GRANT_ID, BLOB)).resolves.toEqual({
      v: 1,
      seq: 3,
      endpoints: [
        { kind: 'tunnel', url: 'https://words-here.trycloudflare.com/v1' },
        { kind: 'lan', url: 'http://192.168.1.5:1337/v1' },
      ],
    })
    await expect(openEndpoints(secret, 'another-grant', BLOB)).rejects.toEqual(new ProtocolError('crypto'))
  })

  it('seals endpoints, and the reader skips what cannot be dialled', async () => {
    const secret = unb64u(GRANT_SECRET)
    const blob = await sealEndpoints(secret, GRANT_ID, 7, [
      { kind: 'tunnel', url: 'https://a.trycloudflare.com/v1' },
      { kind: 'lan', url: 'file:///etc/passwd' },
    ])
    await expect(openEndpoints(secret, GRANT_ID, blob)).resolves.toEqual({
      v: 1,
      seq: 7,
      endpoints: [{ kind: 'tunnel', url: 'https://a.trycloudflare.com/v1' }],
    })
  })

  it('makes the reference check code', () => {
    expect(sas(HOST_ID, CLIENT_DEVICE_ID, DEVICE_PUBLIC)).toBe(SAS)
  })

  it.each([
    [' bcdf-ghjk ', 'BCDFGHJK'],
    ['BCDF GHJK', 'BCDFGHJK'],
    ['ABCD-EFGH', null],
    ['BCDF-GHJ', null],
  ])('normalizes %j like the backend', (raw, expected) => {
    expect(normalizeCode(raw)).toBe(expected)
  })

  it('formats a code and builds the QR link the desktop parses', () => {
    expect(formatCode('BCDFGHJK')).toBe(CODE)
    expect(pairLink(CODE, unb64u(QR_SECRET))).toBe(`atomic-chat://remote/pair?c=BCDF-GHJK&k=${QR_SECRET}`)
  })

  it('refuses non-canonical base64', () => {
    expect(() => unb64u(`${DEVICE_SECRET}=`)).toThrow(ProtocolError)
    expect(() => unb64u('AQ+/')).toThrow(ProtocolError)
    expect(() => devicePublicKey('AQID')).toThrow(ProtocolError)
  })

  it('makes device keys in the keyring format', () => {
    expect(newDeviceApiKey()).toMatch(/^atc_[0-9a-f]{64}$/)
    expect(unb64u(newGrantSecret())).toHaveLength(32)
  })

  it.each([
    ['https://x.trycloudflare.com/v1', true],
    ['http://10.0.0.2:1339/v1', true],
    ['javascript:alert(1)', false],
    ['https://user:pw@x.example/v1', false],
    [`https://x.example/${'a'.repeat(600)}`, false],
  ])('dials %s: %s', (url, expected) => {
    expect(isDialableUrl(url)).toBe(expected)
  })
})
