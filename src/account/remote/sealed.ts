/**
 * The two sealed values of account remote access: the credential envelope (HPKE base mode to the device's
 * X25519 key) and the address blob (ChaCha20-Poly1305 under a key derived from the grant secret). Same
 * reference and vectors as `protocol.ts`.
 */
import { hkdfSync, randomBytes } from 'node:crypto'
import { CipherSuite, HkdfSha256 } from '@hpke/core'
import { DhkemX25519HkdfSha256 } from '@hpke/dhkem-x25519'
import { Chacha20Poly1305 } from '@hpke/chacha20poly1305'
import {
  b64u,
  CREDENTIAL_LABEL,
  ENDPOINTS_LABEL,
  hmac,
  hmacVerify,
  KEY_BYTES,
  ProtocolError,
  unb64u,
  unb64u32,
  utf8,
} from './protocol.js'

/** What the backend accepts for an envelope or a blob, decoded. */
export const MAX_BLOB_BYTES = 3072
const NONCE_BYTES = 12
/** An X25519 encapsulated key. */
const ENC_BYTES = 32
const MAX_ENDPOINTS = 16
const MAX_URL_LENGTH = 512

const suite = new CipherSuite({
  kem: new DhkemX25519HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Chacha20Poly1305(),
})
const aead = new Chacha20Poly1305()

// The credential envelope ---------------------------------------------------------------------------

/** What a host hands a device, sealed to the device's key. */
export interface Credential {
  v: 1
  api_key: string
  /** 32 random bytes, base64url; keys the endpoints blob. */
  grant_secret: string
  host_name: string
}

const credentialInfo = (grantId: string) => utf8(`${CREDENTIAL_LABEL}|${grantId}`)

/** HPKE base mode to the device key; `enc ‖ ciphertext` as base64url. */
export async function sealCredential(
  clientPublicKey: string,
  grantId: string,
  credential: Credential
): Promise<string> {
  const recipientPublicKey = await suite.kem.deserializePublicKey(unb64u32(clientPublicKey))
  const { enc, ct } = await suite.seal(
    { recipientPublicKey, info: credentialInfo(grantId) },
    utf8(JSON.stringify(credential))
  )
  const sealed = Buffer.concat([new Uint8Array(enc), new Uint8Array(ct)])
  if (sealed.length > MAX_BLOB_BYTES) throw new ProtocolError('too_large')
  return b64u(sealed)
}

/** What the device does with an envelope; atc only hosts, so this serves its tests and a future client. */
export async function openCredential(
  deviceSecret: string,
  grantId: string,
  envelope: string
): Promise<Credential> {
  const sealed = unb64u(envelope)
  if (sealed.length <= ENC_BYTES || sealed.length > MAX_BLOB_BYTES) throw new ProtocolError('encoding')
  const recipientKey = await suite.kem.deserializePrivateKey(unb64u32(deviceSecret))
  let plaintext: ArrayBuffer
  try {
    plaintext = await suite.open(
      { recipientKey, enc: sealed.subarray(0, ENC_BYTES), info: credentialInfo(grantId) },
      sealed.subarray(ENC_BYTES)
    )
  } catch {
    throw new ProtocolError('crypto')
  }
  const credential = parseJson(plaintext) as Partial<Credential> | null
  if (
    credential?.v !== 1 ||
    typeof credential.api_key !== 'string' ||
    !credential.api_key.trim() ||
    typeof credential.grant_secret !== 'string' ||
    typeof credential.host_name !== 'string'
  )
    throw new ProtocolError('payload')
  unb64u32(credential.grant_secret)
  return credential as Credential
}

/**
 * `HMAC-SHA256(S, "atomic-remote/credential/v1|" + grant_id + "|" + envelope)`. Proves to a device that paired
 * by code that the envelope is the host's: the backend knows the device's public key and could encrypt to it too.
 */
export const credentialMac = (secret: Uint8Array, grantId: string, envelope: string): string =>
  b64u(hmac(secret, `${CREDENTIAL_LABEL}|${grantId}|${envelope}`))

export const verifyCredentialMac = (
  secret: Uint8Array,
  grantId: string,
  envelope: string,
  mac: string
): boolean => hmacVerify(secret, `${CREDENTIAL_LABEL}|${grantId}|${envelope}`, mac)

// The endpoints blob --------------------------------------------------------------------------------

/** One address of the host's public API, with its prefix (`/v1`). */
export interface Endpoint {
  kind: 'tunnel' | 'lan'
  url: string
}
export interface EndpointsPayload {
  v: 1
  seq: number
  endpoints: Endpoint[]
}

/** `HKDF-SHA256(salt = none, ikm = grant_secret, info = "atomic-remote/endpoints/v1")`, 32 bytes. */
export const endpointsKey = (grantSecret: Uint8Array): Uint8Array =>
  new Uint8Array(hkdfSync('sha256', grantSecret, new Uint8Array(0), ENDPOINTS_LABEL, KEY_BYTES))

/** An address a client may dial: http(s), a host, no credentials in it. */
export function isDialableUrl(raw: string): boolean {
  if (raw.length > MAX_URL_LENGTH) return false
  try {
    const url = new URL(raw)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname !== '' &&
      url.username === '' &&
      url.password === ''
    )
  } catch {
    return false
  }
}

/** `nonce(12) ‖ ChaCha20-Poly1305(key, nonce, plaintext, aad = grant_id)` as base64url. */
export async function sealEndpoints(
  grantSecret: Uint8Array,
  grantId: string,
  seq: number,
  endpoints: readonly Endpoint[]
): Promise<string> {
  const payload: EndpointsPayload = { v: 1, seq, endpoints: endpoints.slice(0, MAX_ENDPOINTS) }
  const nonce = new Uint8Array(randomBytes(NONCE_BYTES))
  const ciphertext = await aead
    .createEncryptionContext(endpointsKey(grantSecret))
    .seal(nonce, utf8(JSON.stringify(payload)), utf8(grantId))
  const sealed = Buffer.concat([nonce, new Uint8Array(ciphertext)])
  if (sealed.length > MAX_BLOB_BYTES) throw new ProtocolError('too_large')
  return b64u(sealed)
}

/** Opens a blob and keeps the endpoints this version can dial; a newer host's other kinds are skipped. */
export async function openEndpoints(
  grantSecret: Uint8Array,
  grantId: string,
  blob: string
): Promise<EndpointsPayload> {
  const sealed = unb64u(blob)
  if (sealed.length <= NONCE_BYTES || sealed.length > MAX_BLOB_BYTES) throw new ProtocolError('encoding')
  let plaintext: ArrayBuffer
  try {
    plaintext = await aead
      .createEncryptionContext(endpointsKey(grantSecret))
      .open(sealed.subarray(0, NONCE_BYTES), sealed.subarray(NONCE_BYTES), utf8(grantId))
  } catch {
    throw new ProtocolError('crypto')
  }
  const wire = parseJson(plaintext) as { v?: unknown; seq?: unknown; endpoints?: unknown } | null
  if (wire?.v !== 1 || typeof wire.seq !== 'number' || !Array.isArray(wire.endpoints))
    throw new ProtocolError('payload')
  const endpoints = wire.endpoints
    .filter(
      (e): e is Endpoint =>
        typeof e === 'object' &&
        e !== null &&
        ((e as Endpoint).kind === 'tunnel' || (e as Endpoint).kind === 'lan') &&
        typeof (e as Endpoint).url === 'string' &&
        isDialableUrl((e as Endpoint).url)
    )
    .map(({ kind, url }) => ({ kind, url }))
    .slice(0, MAX_ENDPOINTS)
  return { v: 1, seq: wire.seq, endpoints }
}

function parseJson(bytes: ArrayBuffer): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new ProtocolError('payload')
  }
}
