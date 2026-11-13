/**
 * `<data>/atc/remote-access.json` (0600, written whole through a temporary file): this server's device key,
 * whether sharing is on, its host record, the open pairing code and the key it issued to each device. It
 * belongs to one account user: another user's file starts over, keeping only the address sequence, so a
 * device never sees a number it already saw.
 */

/** A key this server handed a device, and the secret its address blobs are sealed with. */
export interface IssuedKey {
  grant_id: string
  client_device_id: string
  client_name: string | null
  client_platform: string | null
  api_key: string
  grant_secret: string
  /** ms since the epoch */
  issued_at: number
}

/** A request the person allowed on this server: only it may get a key, and only for the key it showed. */
export interface AllowedRequest {
  grant_id: string
  client_device_id: string
  client_public_key: string
  /** ms since the epoch */
  allowed_at: number
}

export interface PairingRecord {
  /** The 8 letters, without the dash. */
  code: string
  qr_secret: string
  /** ms since the epoch */
  expires_at: number
}

export interface RemoteDocument {
  version: 1
  user_id: string | null
  /** X25519 private key, base64url; the backend knows only its public half. */
  device_secret: string | null
  /** The public key the backend last accepted for this install. */
  registered_key: string | null
  sharing: boolean
  host: { host_id: string; name: string } | null
  pairing: PairingRecord | null
  /** Requests allowed here and not yet given their key. */
  allowed: AllowedRequest[]
  issued: IssuedKey[]
  endpoints_seq: number
}

export const emptyRemote = (endpointsSeq = 0): RemoteDocument => ({
  version: 1,
  user_id: null,
  device_secret: null,
  registered_key: null,
  sharing: false,
  host: null,
  pairing: null,
  allowed: [],
  issued: [],
  endpoints_seq: endpointsSeq,
})

const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const optionalText = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)

function parseIssued(raw: unknown): IssuedKey | null {
  if (!raw || typeof raw !== 'object') return null
  const key = raw as Record<string, unknown>
  if (!text(key['grant_id']) || !text(key['api_key']) || !text(key['grant_secret'])) return null
  return {
    grant_id: key['grant_id'],
    client_device_id: optionalText(key['client_device_id']) ?? '',
    client_name: optionalText(key['client_name']),
    client_platform: optionalText(key['client_platform']),
    api_key: key['api_key'],
    grant_secret: key['grant_secret'],
    issued_at: typeof key['issued_at'] === 'number' ? key['issued_at'] : 0,
  }
}

function parseAllowed(raw: unknown): AllowedRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>
  if (!text(entry['grant_id']) || !text(entry['client_device_id']) || !text(entry['client_public_key']))
    return null
  return {
    grant_id: entry['grant_id'],
    client_device_id: entry['client_device_id'],
    client_public_key: entry['client_public_key'],
    allowed_at: typeof entry['allowed_at'] === 'number' ? entry['allowed_at'] : 0,
  }
}

/** A damaged file reads as empty: no sharing and no keys, which fails closed. */
export function parseRemoteDocument(raw: unknown): RemoteDocument {
  if (!raw || typeof raw !== 'object' || (raw as { version?: unknown }).version !== 1) return emptyRemote()
  const doc = raw as Record<string, unknown>
  const host = doc['host'] as Record<string, unknown> | null | undefined
  const pairing = doc['pairing'] as Record<string, unknown> | null | undefined
  const seq = doc['endpoints_seq']
  return {
    version: 1,
    user_id: optionalText(doc['user_id']),
    device_secret: optionalText(doc['device_secret']),
    registered_key: optionalText(doc['registered_key']),
    sharing: doc['sharing'] === true,
    host:
      host && text(host['host_id']) && text(host['name'])
        ? { host_id: host['host_id'], name: host['name'] }
        : null,
    pairing:
      pairing &&
      text(pairing['code']) &&
      text(pairing['qr_secret']) &&
      typeof pairing['expires_at'] === 'number'
        ? { code: pairing['code'], qr_secret: pairing['qr_secret'], expires_at: pairing['expires_at'] }
        : null,
    allowed: Array.isArray(doc['allowed'])
      ? doc['allowed'].map(parseAllowed).filter((a): a is AllowedRequest => a !== null)
      : [],
    issued: Array.isArray(doc['issued'])
      ? doc['issued'].map(parseIssued).filter((k): k is IssuedKey => k !== null)
      : [],
    endpoints_seq: typeof seq === 'number' && Number.isSafeInteger(seq) && seq >= 0 ? seq : 0,
  }
}

/** The file for `userId`: unchanged when it is theirs, a fresh one (same sequence) when it was someone else's. */
export function forUser(document: RemoteDocument, userId: string): RemoteDocument {
  if (document.user_id === userId) return document
  return { ...emptyRemote(document.endpoints_seq), user_id: userId }
}

/**
 * Access ends on this server (signed out, session lost, host removed): no sharing, no host, no pairing and no
 * device keys. The device key and the address sequence stay.
 */
export const endAccess = (document: RemoteDocument): RemoteDocument => ({
  ...document,
  sharing: false,
  host: null,
  pairing: null,
  allowed: [],
  issued: [],
})
