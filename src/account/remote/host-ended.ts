/**
 * Devices whose access ended from their side — the device disconnected, another device revoked it, it signed
 * out — as the clients announce them: newest first, for a few minutes, a few at most. Pure.
 */
import type { AccountRemoteEnded } from '../../contract/index.js'
import { cleanText } from '../text.js'
import type { IssuedKey } from './remote-store.js'

/** A device that disconnected stays listed this long. */
export const ENDED_SHOWN_MS = 5 * 60_000
/** At most this many are listed. */
export const ENDED_SHOWN = 5

/** The list with the keys a sync dropped at `at` put first, names cleaned for display. */
export function withEnded(
  list: readonly AccountRemoteEnded[],
  keys: readonly IssuedKey[],
  at: number
): AccountRemoteEnded[] {
  const ended = keys.map((k) => ({
    grant_id: k.grant_id,
    device_name: cleanText(k.client_name),
    platform: cleanText(k.client_platform, 32),
    at,
  }))
  return [...ended, ...list].slice(0, ENDED_SHOWN)
}

/** The entries still worth announcing at `now`. */
export const recentEnded = (list: readonly AccountRemoteEnded[], now: number): AccountRemoteEnded[] =>
  list.filter((e) => now - e.at < ENDED_SHOWN_MS)
