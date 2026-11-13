/**
 * The cryptography of account remote access, as the backend README defines it ("Remote access API" →
 * "Protocol (clients)"): encoding, the device key, pairing proofs and the check code; `sealed.ts` has the
 * envelope and the address blob. The backend only stores these values; hosts and devices make and check them. Its
 * `tests/remote_protocol.py` is the reference, and the tests use vectors produced by it — the same ones the
 * desktop app's `protocol.rs` checks. Pure: no I/O, no clock, randomness only where the protocol asks for it.
 */
import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

export const PAIR_LABEL = 'atomic-remote/pair/v1'
export const CREDENTIAL_LABEL = 'atomic-remote/credential/v1'
export const ENDPOINTS_LABEL = 'atomic-remote/endpoints/v1'
export const SAS_LABEL = 'atomic-remote/sas/v1'
/** The deep link a host shows as a QR code. */
export const PAIR_LINK_PREFIX = 'atomic-chat://remote/pair'
export const KEY_BYTES = 32
/** Pairing codes: 8 letters of this alphabet, shown as `BCDF-GHJK`. */
const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'
const CODE_LENGTH = 8
/** PKCS#8 DER header of a raw X25519 private key: the key's 32 bytes follow it. */
const X25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex')

/** A protocol value that cannot be trusted. Deliberately coarse: the caller only needs to know that. */
export class ProtocolError extends Error {
  constructor(readonly reason: 'encoding' | 'crypto' | 'payload' | 'too_large') {
    super(`remote-access value refused: ${reason}`)
    this.name = 'ProtocolError'
  }
}

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

export const b64u = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url')

/** Strict unpadded base64url, as the backend checks it: a non-canonical spelling of the same bytes is refused. */
export function unb64u(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new ProtocolError('encoding')
  const bytes = Buffer.from(text, 'base64url')
  if (bytes.toString('base64url') !== text) throw new ProtocolError('encoding')
  return new Uint8Array(bytes)
}

export function unb64u32(text: string): Uint8Array {
  const bytes = unb64u(text)
  if (bytes.length !== KEY_BYTES) throw new ProtocolError('encoding')
  return bytes
}

const random32 = (): Uint8Array => new Uint8Array(randomBytes(KEY_BYTES))
export const hmac = (secret: Uint8Array, message: string): Buffer =>
  createHmac('sha256', secret).update(message, 'utf8').digest()

export function hmacVerify(secret: Uint8Array, message: string, expected: string): boolean {
  let tag: Uint8Array
  try {
    tag = unb64u(expected)
  } catch {
    return false
  }
  const actual = hmac(secret, message)
  return tag.length === actual.length && timingSafeEqual(tag, actual)
}

// The device key -------------------------------------------------------------------------------------

/** A new X25519 private key: 32 random bytes as base64url. Any 32 bytes are one (the KEM clamps them). */
export const newDeviceSecret = (): string => b64u(random32())

/** The public half of a device key, raw 32 bytes as base64url (43 characters), for `PUT /v1/remote/device`. */
export function devicePublicKey(secret: string): string {
  const der = Buffer.concat([X25519_PKCS8_PREFIX, unb64u32(secret)])
  const jwk = createPublicKey(createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })).export({
    format: 'jwk',
  })
  if (typeof jwk.x !== 'string') throw new ProtocolError('encoding')
  return jwk.x
}

// Pairing -------------------------------------------------------------------------------------------

/** The 8 letters of a typed code, any case, dashes and spaces ignored; null when it cannot be a code. */
export function normalizeCode(raw: string): string | null {
  const code = raw.replace(/[\s-]/g, '').toUpperCase()
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null
}

/** `BCDFGHJK` → `BCDF-GHJK`. */
export const formatCode = (code: string): string =>
  `${code.slice(0, code.length / 2)}-${code.slice(code.length / 2)}`

/** The pairing secret of a typed code: its 8 letters, no dash, upper case. */
export const codeSecret = (normalizedCode: string): Uint8Array => utf8(normalizedCode)

/** 32 random bytes a host shows only inside its QR code. */
export const newQrSecret = (): Uint8Array => random32()

/** The QR link for a code: `atomic-chat://remote/pair?c=<code>&k=<qr secret as unpadded base64url>`. */
export const pairLink = (formattedCode: string, qrSecret: Uint8Array): string =>
  `${PAIR_LINK_PREFIX}?c=${formattedCode}&k=${b64u(qrSecret)}`

/** `HMAC-SHA256(S, "atomic-remote/pair/v1|" + client_public_key)`. */
export const pairProof = (secret: Uint8Array, clientPublicKey: string): string =>
  b64u(hmac(secret, `${PAIR_LABEL}|${clientPublicKey}`))

export const verifyPairProof = (secret: Uint8Array, clientPublicKey: string, proof: string): boolean =>
  hmacVerify(secret, `${PAIR_LABEL}|${clientPublicKey}`, proof)

// The check code ("Allow") and new secrets -----------------------------------------------------------

/**
 * First 4 bytes of `SHA-256("atomic-remote/sas/v1|" + host_id + "|" + client_device_id + "|" +
 * client_public_key)`, big-endian, mod 10^6, zero-padded to 6 digits.
 */
export function sas(hostId: string, clientDeviceId: string, clientPublicKey: string): string {
  const digest = createHash('sha256')
    .update(`${SAS_LABEL}|${hostId}|${clientDeviceId}|${clientPublicKey}`, 'utf8')
    .digest()
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, '0')
}

/** A device's key for this server's public API, in the keyring's own format. */
export const newDeviceApiKey = (): string => `atc_${randomBytes(32).toString('hex')}`

/** A new `grant_secret`, as the credential carries it. */
export const newGrantSecret = (): string => b64u(random32())
