/**
 * This server as a remote access host: the file, the loop and what the person does — share or stop sharing,
 * open a pairing code, allow or deny a request, revoke a device. Device keys reach the public API only while
 * sharing is on for the account signed in now (`keys()`, sampled on every request). Every change counts in
 * memory first and is then written, so a failed write never leaves a removed key working.
 */
import { join } from 'node:path'
import type { AccountPairingCode, AccountRemoteEnded, AccountRemoteRequest } from '../../contract/index.js'
import type { WorkspaceRemoteHost } from '../../contract/index.js'
import { readDocument, writeDocument } from '../../terminal-data/index.js'
import { AccountApiError } from '../account-api.js'
import { qrSvg } from '../qr.js'
import type { AccountSession } from '../session.js'
import { devicesWithAccess, pendingRequests } from './host-plan.js'
import { applySync, ensureHost, type RoundContext, type UploadMark } from './host-round.js'
import { startLoop, type Loop } from './host-loop.js'
import { b64u, formatCode, newQrSecret, normalizeCode, pairLink } from './protocol.js'
import { REMOTE_CODES, MAX_WAIT_SECONDS, type RemoteApi } from './remote-api.js'
import { endAccess, forUser, parseRemoteDocument, stopSharing, type RemoteDocument } from './remote-store.js'
import { endGrants, grantsToEnd, type GrantsToEnd } from './host-stop.js'
import { recentEnded, withEnded } from './host-ended.js'
import { reachability, type Reachability, type ReachabilityInput } from './reachability.js'

/** A pairing code lives 10 minutes; whatever the service says, between one minute and an hour. */
const pairingLifetimeMs = (seconds: unknown) =>
  Math.min(3600, Math.max(60, Number.isFinite(Number(seconds)) ? Number(seconds) : 600)) * 1000

export interface RemoteHostOptions {
  atcDir: string
  session: AccountSession
  api: RemoteApi
  /** The name devices see: this machine's name. */
  hostName: () => string
  /** The tunnel, the public server and the LAN addresses, as the core reports them now. */
  reachability: () => Promise<ReachabilityInput>
  now?: () => number
  log: { info(message: string): void; warn(message: string): void }
}

export class RemoteHost {
  readonly path: string
  private document: RemoteDocument | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private loop: Loop | null = null
  private stopping: Promise<void> = Promise.resolve()
  private requests: AccountRemoteRequest[] = []
  /** The device and key behind each request shown, as the last sync gave them. */
  private pending = new Map<string, { client_device_id: string; client_public_key: string }>()
  private reach: Reachability | null = null
  private error: string | null = null
  /** Devices whose access ended from their side, newest first. */
  private ended: AccountRemoteEnded[] = []
  constructor(private readonly options: RemoteHostOptions) {
    this.path = join(options.atcDir, 'remote-access.json')
  }
  private now(): number {
    return (this.options.now ?? Date.now)()
  }
  private async read(): Promise<RemoteDocument> {
    this.document ??= parseRemoteDocument(await readDocument<unknown>(this.path, null).catch(() => null))
    return this.document
  }
  /** One change at a time: it counts in memory at once, then it is written. */
  update(change: (document: RemoteDocument) => RemoteDocument): Promise<RemoteDocument> {
    const next = this.queue.then(async () => {
      const before = await this.read()
      const after = change(before)
      if (after === before) return after
      this.document = after
      await writeDocument(this.path, after)
      return after
    })
    this.queue = next.catch(() => undefined)
    return next
  }
  /** Sharing is on, and for the account signed in now: a file left by another session shares nothing. */
  sharingNow(): boolean {
    const document = this.document
    const user = this.options.session.user()
    return Boolean(document?.sharing && user && document.user_id === user.id)
  }
  /** The device keys the public API accepts now. */
  keys(): readonly string[] {
    return this.sharingNow() ? this.document!.issued.map((k) => k.api_key) : []
  }
  view(): WorkspaceRemoteHost {
    const document = this.document
    const pairing = document?.pairing
    const sharing = this.sharingNow()
    return {
      sharing,
      host_name: document?.host?.name ?? null,
      tunnel: this.reach?.tunnel ?? 'off',
      lan: this.reach?.lan ?? false,
      addresses: this.reach?.endpoints.length ?? 0,
      pairing:
        sharing && pairing && pairing.expires_at > this.now() ? { expires_at: pairing.expires_at } : null,
      requests: sharing ? this.requests : [],
      devices: sharing && document ? devicesWithAccess(document) : [],
      ended: sharing ? recentEnded(this.ended, this.now()) : [],
      error: sharing ? this.error : null,
    }
  }
  /** Read the file; resume hosting when sharing was on for the account signed in now. */
  async start(): Promise<void> {
    await this.read()
    if (this.sharingNow()) this.run()
  }
  stop(): void {
    this.loop?.stop()
    this.stopping = this.loop?.ended ?? this.stopping
    this.loop = null
  }
  /** Settles once a stopped loop has ended and every change is written: before the data folder goes away. */
  async settled(): Promise<void> {
    await this.stopping
    await this.queue
  }
  /** Something a sync reports changed (the tunnel, the server, a decision): sync now. */
  wake(): void {
    this.loop?.wake()
  }
  /** Signed out, session lost or host removed: stop, and forget every device key and the host. */
  async endAccess(): Promise<void> {
    this.stop()
    this.requests = []
    this.pending.clear()
    this.error = null
    this.ended = []
    await this.update(endAccess)
  }
  private context(): RoundContext {
    return {
      session: this.options.session,
      api: this.options.api,
      hostName: this.options.hostName,
      update: (change) => this.update(change),
      now: () => this.now(),
      log: this.options.log,
      // Keys a sync dropped: those devices' access ended from their side, which the clients announce.
      ended: (keys) => {
        if (keys.length) this.ended = withEnded(this.ended, keys, this.now())
      },
    }
  }
  private authed<T>(work: (token: string) => Promise<T>): Promise<T> {
    return this.options.session.authed(work)
  }
  /**
   * Turn sharing on: register the host and start the loop. Off ends every device's access: the keys stop here
   * first, then every request is denied and every live grant revoked on the account service, so the devices
   * learn it and pair again next time. The host stays registered unless `forget` removes it as well.
   */
  async setSharing(enabled: boolean, forget = false): Promise<void> {
    const user = this.options.session.user()
    if (enabled) {
      if (!user) throw new AccountApiError(401, 'not_signed_in')
      await this.update((d) => ({ ...forUser(d, user.id), sharing: true }))
      await ensureHost(this.context())
      // Known before the first round, so the answer already says where devices can reach this server.
      this.reach = reachability(await this.options.reachability())
      this.run()
      return
    }
    this.stop()
    const known: GrantsToEnd = { pending: [...this.pending.keys()], live: [] }
    let pairing = false
    this.requests = []
    this.pending.clear()
    this.ended = []
    this.error = null
    // Off first: whatever the service answers, the keys stop here.
    await this.update((d) => {
      known.live = [...new Set([...d.issued, ...d.allowed].map((k) => k.grant_id))]
      pairing = d.pairing !== null
      return forget ? endAccess(d) : stopSharing(d)
    })
    if (!user) return
    const ctx = { session: this.options.session, api: this.options.api, log: this.options.log }
    const failure = await endGrants(ctx, await grantsToEnd(ctx, known))
    if (pairing) await this.authed((token) => this.options.api.closePairingCode(token)).catch(() => undefined)
    if (forget)
      await this.authed((token) => this.options.api.disableHost(token)).catch((error: unknown) => {
        if (!(error instanceof AccountApiError && error.is(REMOTE_CODES.HOST_NOT_FOUND))) throw error
      })
    if (failure !== null) throw failure
  }
  /** A code for 10 minutes, and its QR link with a secret the account service never sees. */
  async openPairing(): Promise<AccountPairingCode> {
    if (!this.sharingNow()) throw new AccountApiError(409, 'not_sharing')
    await ensureHost(this.context())
    const answer = await this.authed((token) => this.options.api.openPairingCode(token))
    const code = normalizeCode(String(answer.code))
    if (!code) throw new AccountApiError(502, 'bad_pairing_code')
    const qr = newQrSecret()
    const expiresAt = this.now() + pairingLifetimeMs(answer.expires_in)
    await this.update((d) => ({ ...d, pairing: { code, qr_secret: b64u(qr), expires_at: expiresAt } }))
    this.wake()
    const link = pairLink(formatCode(code), qr)
    return { code: formatCode(code), link, expires_at: expiresAt, qr_svg: qrSvg(link) }
  }
  async closePairing(): Promise<void> {
    await this.update((d) => (d.pairing ? { ...d, pairing: null } : d))
    await this.authed((token) => this.options.api.closePairingCode(token)).catch(() => undefined)
    this.wake()
  }
  /**
   * Allow or deny a device that asked and is still shown here. An allowed one is written down first — its
   * device and the key its check code covered — and only that grant, with that key, gets a key later.
   */
  async decide(grantId: string, allow: boolean): Promise<void> {
    const request = this.pending.get(grantId)
    if (!request) throw new AccountApiError(404, 'grant_not_found')
    if (allow)
      await this.update((d) => ({
        ...d,
        allowed: [
          ...d.allowed.filter((a) => a.grant_id !== grantId),
          {
            grant_id: grantId,
            client_device_id: request.client_device_id,
            client_public_key: request.client_public_key,
            allowed_at: this.now(),
          },
        ],
      }))
    await this.authed((token) => this.options.api.decide(token, grantId, allow))
    this.requests = this.requests.filter((r) => r.grant_id !== grantId)
    this.wake()
  }
  /** Revoke a device: its key stops working at once, whatever the account service answers. */
  async revoke(grantId: string): Promise<void> {
    await this.update((d) => ({ ...d, issued: d.issued.filter((k) => k.grant_id !== grantId) }))
    await this.authed((token) => this.options.api.revokeGrant(token, grantId)).catch((error: unknown) => {
      if (!(error instanceof AccountApiError && error.is(REMOTE_CODES.GRANT_NOT_FOUND))) throw error
    })
    this.wake()
  }
  private run(): void {
    if (this.loop) return this.loop.wake()
    const ctx = this.context()
    let uploaded: UploadMark | null = null
    const loop: Loop = startLoop(
      {
        now: () => this.now(),
        round: async (after, wait, signal) => {
          const host = await ensureHost(ctx)
          const reach = reachability(await this.options.reachability())
          this.reach = reach
          const sync = await this.authed((token) =>
            this.options.api.sync(token, { after, wait, tunnel: reach.tunnel, lan: reach.lan }, signal)
          )
          if (sync.host.id !== host.host_id)
            await this.update((d) => ({ ...d, host: { host_id: sync.host.id, name: sync.host.name } }))
          uploaded = await applySync(ctx, sync, reach, uploaded).catch((error: unknown) => {
            uploaded = null
            throw error
          })
          return sync
        },
        succeeded: (sync) => {
          this.requests = pendingRequests(sync)
          this.pending = new Map(
            sync.grants
              .filter((g) => g.status === 'pending')
              .map((g) => [g.id, { client_device_id: g.client.id, client_public_key: g.client_public_key }])
          )
          this.error = null
        },
        failed: (error, retryInMs) => {
          this.error = describe(error)
          uploaded = null
          this.options.log.warn(
            `remote: sync failed, retrying in ${Math.round(retryInMs / 1000)} s: ${this.error}`
          )
        },
        fatal: (error) => this.fatal(error),
      },
      MAX_WAIT_SECONDS,
      () => {
        if (this.loop === loop) this.loop = null
      }
    )
    this.loop = loop
  }
  private async fatal(error: unknown): Promise<void> {
    if (error instanceof AccountApiError && error.is(REMOTE_CODES.HOST_NOT_FOUND)) {
      this.options.log.info('remote: this server was removed as a host; sharing is off')
      this.loop = null
      await this.endAccess()
    }
    // A lost session ends access through the session's own change event.
  }
}

function describe(error: unknown): string {
  if (error instanceof AccountApiError) return `the account service answered ${error.status} (${error.code})`
  return 'cannot reach the account service'
}
