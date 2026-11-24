/**
 * What a host does about one sync answer — pure, so every rule is a table row. The host decides: a code
 * pairing is honoured only when the device's proof checks out against the code this server showed; a
 * request only when the person allowed it here, for the device and the key its check code covered — an
 * `approved` the account service reports on its own gets nothing. Keys of grants no longer live are dropped.
 */
import type { AccountRemoteDevice, AccountRemoteRequest } from '../../contract/index.js'
import { cleanText } from '../text.js'
import { codeSecret, sas, unb64u, verifyPairProof } from './protocol.js'
import type { HostSync } from './remote-api.js'
import type { RemoteDocument } from './remote-store.js'

/** A redeemed code still proves a device this long after it expired: it may pair in its last second. */
export const PAIRING_GRACE_MS = 10 * 60_000

/** A grant this host should hand a key to now. */
export interface IssueOrder {
  grant_id: string
  client_device_id: string
  client_name: string | null
  client_platform: string | null
  client_public_key: string
  /** For a code pairing: the secret the proof matched, to MAC the envelope. */
  mac_secret: Uint8Array | null
}

export interface HostPlan {
  /** Code pairings whose proof does not check out. */
  deny: string[]
  issue: IssueOrder[]
  /** Active grants this server holds no key for (its file was lost): the device has to pair again. */
  revoke_unknown: string[]
  /** Issued keys whose grant is no longer live. */
  dropped: string[]
  /** The open code expired past its grace. (A used one is cleared once its device got the key.) */
  clear_pairing: boolean
}

function pairingSecrets(document: RemoteDocument, now: number): Uint8Array[] {
  const pairing = document.pairing
  if (!pairing || now > pairing.expires_at + PAIRING_GRACE_MS) return []
  const secrets = [codeSecret(pairing.code)]
  try {
    secrets.push(unb64u(pairing.qr_secret))
  } catch {
    // A damaged QR secret leaves the typed code.
  }
  return secrets
}

/** The person allowed this very request here: same grant, same device, same key as the check code showed. */
const allowedHere = (document: RemoteDocument, grant: HostSync['grants'][number]) =>
  document.allowed.some(
    (a) =>
      a.grant_id === grant.id &&
      a.client_device_id === grant.client.id &&
      a.client_public_key === grant.client_public_key
  )

export function planHost(sync: HostSync, document: RemoteDocument, now: number): HostPlan {
  const plan: HostPlan = { deny: [], issue: [], revoke_unknown: [], dropped: [], clear_pairing: false }
  const secrets = pairingSecrets(document, now)
  const issued = new Set(document.issued.map((k) => k.grant_id))
  for (const grant of sync.grants) {
    if (grant.status === 'approved' && grant.needs_credential) {
      const order = (mac_secret: Uint8Array | null): IssueOrder => ({
        grant_id: grant.id,
        client_device_id: grant.client.id,
        client_name: grant.client.device_name,
        client_platform: grant.client.platform,
        client_public_key: grant.client_public_key,
        mac_secret,
      })
      if (grant.method === 'code') {
        const proof = grant.proof
        const matched = proof
          ? secrets.find((secret) => verifyPairProof(secret, grant.client_public_key, proof))
          : undefined
        if (matched) plan.issue.push(order(matched))
        else plan.deny.push(grant.id)
      } else if (grant.method === 'request' && allowedHere(document, grant)) plan.issue.push(order(null))
      else plan.deny.push(grant.id)
    } else if (grant.status === 'active' && !issued.has(grant.id)) plan.revoke_unknown.push(grant.id)
  }
  const live = new Set(
    sync.grants.filter((g) => g.status === 'approved' || g.status === 'active').map((g) => g.id)
  )
  plan.dropped = document.issued.filter((k) => !live.has(k.grant_id)).map((k) => k.grant_id)
  if (document.pairing && now > document.pairing.expires_at + PAIRING_GRACE_MS) plan.clear_pairing = true
  return plan
}

/** Devices asking for access, with the check code the person compares on both screens. */
export function pendingRequests(sync: HostSync): AccountRemoteRequest[] {
  return sync.grants
    .filter((g) => g.status === 'pending')
    .map((g) => ({
      grant_id: g.id,
      device_name: cleanText(g.client.device_name),
      platform: cleanText(g.client.platform, 32),
      client_type: cleanText(g.client.client_type, 32) ?? 'unknown',
      check_code: sas(sync.host.id, g.client.id, g.client_public_key),
      created_at: g.created_at,
    }))
}

/** Devices that hold a key from this server. */
export const devicesWithAccess = (document: RemoteDocument): AccountRemoteDevice[] =>
  document.issued.map((k) => ({
    grant_id: k.grant_id,
    device_name: cleanText(k.client_name),
    platform: cleanText(k.client_platform, 32),
    since: k.issued_at,
  }))
