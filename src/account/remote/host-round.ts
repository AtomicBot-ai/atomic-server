/**
 * One round of this server as a host: register the device and the host, long-poll `POST /host/sync` with the
 * tunnel and LAN state, then act on the answer — deny bad proofs, hand each approved device its own sealed
 * key, drop keys of grants that ended, and send every active device a fresh sealed copy of the addresses
 * whenever they or the set of devices changed. A key is written to the file before it is sent.
 */
import { AccountApiError } from '../account-api.js'
import type { AccountSession } from '../session.js'
import { planHost, type HostPlan } from './host-plan.js'
import { devicePublicKey, newDeviceApiKey, newDeviceSecret, newGrantSecret, unb64u } from './protocol.js'
import { credentialMac, sealCredential, sealEndpoints, type Endpoint } from './sealed.js'
import { REMOTE_CODES, type HostSync, type RemoteApi } from './remote-api.js'
import { forUser, type IssuedKey, type RemoteDocument } from './remote-store.js'
import { sameEndpoints, type Reachability } from './reachability.js'

export interface RoundContext {
  session: AccountSession
  api: RemoteApi
  hostName: () => string
  update: (change: (document: RemoteDocument) => RemoteDocument) => Promise<RemoteDocument>
  now: () => number
  log: { info(message: string): void; warn(message: string): void }
  /** Keys a sync dropped because their grant ended elsewhere (the device disconnected, revoked, signed out). */
  ended?: (keys: readonly IssuedKey[]) => void
}

/** What the host last uploaded: the same addresses to the same grants need no new blobs. */
export interface UploadMark {
  endpoints: Endpoint[]
  grants: string[]
}

/** Errors that only mean "this grant moved on meanwhile". */
const isGrantRace = (error: unknown) =>
  error instanceof AccountApiError &&
  [REMOTE_CODES.INVALID_STATE, REMOTE_CODES.KEY_MISMATCH, REMOTE_CODES.GRANT_NOT_FOUND].some((c) =>
    error.is(c)
  )

/** End the round, and stop hosting, for these. */
export const isFatal = (error: unknown): boolean =>
  error instanceof AccountApiError &&
  ['invalid_grant', 'not_signed_in', REMOTE_CODES.HOST_NOT_FOUND].some((c) => error.is(c))

async function registerDevice(ctx: RoundContext, publicKey: string): Promise<void> {
  await ctx.session.authed((token) => ctx.api.registerDevice(token, publicKey, ctx.hostName()))
  await ctx.update((d) => ({ ...d, registered_key: publicKey }))
}

/** Register the device, then this server as a host (again when its name changed). The owner gets an email. */
export async function ensureHost(ctx: RoundContext): Promise<{ host_id: string; name: string }> {
  const user = ctx.session.user()
  if (!user) throw new AccountApiError(401, 'not_signed_in')
  const document = await ctx.update((d) => {
    const mine = forUser(d, user.id)
    return mine.device_secret ? mine : { ...mine, device_secret: newDeviceSecret() }
  })
  const publicKey = devicePublicKey(document.device_secret!)
  if (document.registered_key !== publicKey) await registerDevice(ctx, publicKey)
  const name = ctx.hostName()
  if (document.host?.name === name) return document.host
  const enable = () => ctx.session.authed((token) => ctx.api.enableHost(token, name))
  const host = await enable().catch(async (error: unknown) => {
    if (!(error instanceof AccountApiError) || !error.is(REMOTE_CODES.DEVICE_NOT_REGISTERED)) throw error
    await registerDevice(ctx, publicKey)
    return enable()
  })
  const record = { host_id: host.id, name: host.name }
  await ctx.update((d) => ({ ...d, host: record }))
  return record
}

/** Collects the first non-fatal failure of a round; fatal ones end it at once, grant races are ignored. */
class Failures {
  first: unknown = null
  keep(error: unknown): void {
    if (isFatal(error)) throw error
    if (!isGrantRace(error)) this.first ??= error
  }
}

async function issue(
  ctx: RoundContext,
  plan: HostPlan,
  failures: Failures,
  hostName: string
): Promise<Set<string>> {
  const activated = new Set<string>()
  for (const order of plan.issue) {
    const key: IssuedKey = {
      grant_id: order.grant_id,
      client_device_id: order.client_device_id,
      client_name: order.client_name,
      client_platform: order.client_platform,
      api_key: newDeviceApiKey(),
      grant_secret: newGrantSecret(),
      issued_at: ctx.now(),
    }
    let envelope: string
    try {
      envelope = await sealCredential(order.client_public_key, order.grant_id, {
        v: 1,
        api_key: key.api_key,
        grant_secret: key.grant_secret,
        host_name: hostName,
      })
    } catch (error) {
      ctx.log.warn(`remote: cannot seal grant ${order.grant_id}: ${String(error)}`)
      continue
    }
    const mac = order.mac_secret ? credentialMac(order.mac_secret, order.grant_id, envelope) : undefined
    // Written before it is sent: a crash in between leaves a key for a grant that never activated, which the
    // next round drops.
    await ctx.update((d) => ({ ...d, issued: [...d.issued.filter((k) => k.grant_id !== key.grant_id), key] }))
    try {
      await ctx.session.authed((token) =>
        ctx.api.uploadCredential(token, order.grant_id, {
          envelope,
          ...(mac ? { mac } : {}),
          client_public_key: order.client_public_key,
        })
      )
      ctx.log.info(`remote: gave grant ${order.grant_id} its key`)
      activated.add(order.grant_id)
    } catch (error) {
      await ctx.update((d) => ({ ...d, issued: d.issued.filter((k) => k.grant_id !== order.grant_id) }))
      failures.keep(error)
    }
  }
  return activated
}

/** Act on one sync answer; returns the new upload mark. Throws the first failure after doing what it could. */
export async function applySync(
  ctx: RoundContext,
  sync: HostSync,
  reach: Reachability,
  uploaded: UploadMark | null
): Promise<UploadMark | null> {
  const before = await ctx.update((d) => d)
  const plan = planHost(sync, before, ctx.now())
  const failures = new Failures()
  for (const id of plan.deny) {
    ctx.log.info(`remote: denying grant ${id}: its pairing proof does not check out`)
    await ctx.session
      .authed((token) => ctx.api.decide(token, id, false))
      .catch((e: unknown) => failures.keep(e))
  }
  for (const id of plan.revoke_unknown) {
    ctx.log.info(`remote: revoking grant ${id}: this server holds no key for it`)
    await ctx.session
      .authed((token) => ctx.api.revokeGrant(token, id))
      .catch((e: unknown) => failures.keep(e))
  }
  const activated = await issue(ctx, plan, failures, before.host?.name ?? ctx.hostName())
  // A used code is done once its device holds the key; a failed upload keeps it for the next round.
  const codeUsed = plan.issue.some((o) => o.mac_secret !== null && activated.has(o.grant_id))
  // Allowed requests wait only while their grant does, and until their key is out.
  const waiting = new Set(
    sync.grants.filter((g) => g.status === 'pending' || g.status === 'approved').map((g) => g.id)
  )
  // Keep shown names current; drop keys of grants that ended.
  const names = new Map(sync.grants.map((g) => [g.id, g.client] as const))
  let dropped: IssuedKey[] = []
  const after = await ctx.update((d) => {
    dropped = d.issued.filter((k) => plan.dropped.includes(k.grant_id))
    const next = {
      ...d,
      allowed: d.allowed.filter((a) => waiting.has(a.grant_id) && !activated.has(a.grant_id)),
      issued: d.issued
        .filter((k) => !plan.dropped.includes(k.grant_id))
        .map((k) => {
          const client = names.get(k.grant_id)
          return client ? { ...k, client_name: client.device_name, client_platform: client.platform } : k
        }),
      pairing: plan.clear_pairing || codeUsed ? null : d.pairing,
    }
    // A round that changed nothing writes nothing.
    return JSON.stringify(next) === JSON.stringify(d) ? d : next
  })
  ctx.ended?.(dropped)
  // Addresses: every active grant this server holds a key for.
  const active = new Set([...sync.grants.filter((g) => g.status === 'active').map((g) => g.id), ...activated])
  const targets = after.issued.filter((k) => active.has(k.grant_id))
  const mark: UploadMark = { endpoints: reach.endpoints, grants: targets.map((k) => k.grant_id).sort() }
  let next = uploaded
  const unchanged =
    uploaded !== null &&
    sameEndpoints(uploaded.endpoints, mark.endpoints) &&
    uploaded.grants.join() === mark.grants.join()
  if (targets.length > 0 && !unchanged) {
    const { endpoints_seq: seq } = await ctx.update((d) => ({ ...d, endpoints_seq: d.endpoints_seq + 1 }))
    const items: Array<{ grant_id: string; blob: string }> = []
    for (const key of targets)
      items.push({
        grant_id: key.grant_id,
        blob: await sealEndpoints(unb64u(key.grant_secret), key.grant_id, seq, reach.endpoints),
      })
    next = await ctx.session
      .authed((token) => ctx.api.uploadEndpoints(token, items))
      .then(() => mark)
      .catch((e: unknown) => {
        failures.keep(e)
        return null
      })
  }
  if (failures.first !== null) throw failures.first
  return next
}
