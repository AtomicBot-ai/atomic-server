/**
 * The account as the server runs it: the session, a sign-in in progress and the remote access host, behind
 * the `account.*` workspace operations. Signing out, or losing the session, ends every device's access.
 */
import { hostname as osHostname } from 'node:os'
import { AtcError } from '../errors/index.js'
import type { WorkspaceAccount, WorkspaceInput } from '../contract/index.js'
import { ATC_VERSION } from '../version.js'
import { accountApiBase, accountCaller } from './account-api.js'
import { clientInfo, deviceName } from './client-info.js'
import { serviceFailure } from './failures.js'
import { remoteApi } from './remote/remote-api.js'
import { RemoteHost } from './remote/remote-host.js'
import type { ReachabilityInput } from './remote/reachability.js'
import { AccountSession } from './session.js'
import { SignIn } from './sign-in.js'
import { cleanText } from './text.js'

export interface AccountServiceOptions {
  atcDir: string
  fetch: typeof fetch
  env?: NodeJS.ProcessEnv
  platform?: string
  hostname?: () => string
  /** `account.enabled`: while false every operation is refused and the loop never starts. */
  enabled: () => boolean
  /** The tunnel, the public server and the LAN addresses, as the core reports them now. */
  reachability: () => Promise<ReachabilityInput>
  /** Make the public API reachable from other devices: start it and the tunnel, or refuse saying why. */
  bringUp: () => Promise<void>
  log: { info(message: string): void; warn(message: string): void }
  now?: () => number
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

export class AccountService {
  readonly session: AccountSession
  readonly signIn: SignIn
  readonly remote: RemoteHost
  constructor(private readonly options: AccountServiceOptions) {
    const call = accountCaller(accountApiBase(options.env), options.fetch)
    const now = options.now ?? Date.now
    const hostName = () => deviceName((options.hostname ?? osHostname)()) ?? 'Atomic Server'
    this.session = new AccountSession({ atcDir: options.atcDir, call, now })
    this.signIn = new SignIn({
      call,
      session: this.session,
      now,
      client: async () =>
        clientInfo({
          installationId: (await this.session.load()).installation_id,
          hostname: hostName(),
          ...(options.platform ? { platform: options.platform } : {}),
          version: ATC_VERSION,
        }),
    })
    this.remote = new RemoteHost({
      atcDir: options.atcDir,
      session: this.session,
      api: remoteApi(call),
      hostName,
      reachability: options.reachability,
      now,
      log: options.log,
    })
    this.session.onChange((change) => {
      if (change === 'signedIn') return
      if (change === 'sessionLost') options.log.warn('account: the session ended; devices lost access')
      // Keys stop in memory at once; a failed write is said, not hidden.
      void this.remote
        .endAccess()
        .catch((e: unknown) => options.log.warn(`account: could not save the end of access: ${String(e)}`))
    })
  }
  /** Read the files and resume hosting when sharing was on. */
  async start(): Promise<void> {
    if (!this.options.enabled()) return
    await this.session.load()
    await this.remote.start()
  }
  /**
   * After the server's own start-up (the API per `api.autoStart`): while sharing is on, bring the API and the
   * tunnel back up, since the tunnel and its URL do not survive a restart.
   */
  async resume(): Promise<void> {
    if (!this.options.enabled() || !this.remote.sharingNow()) return
    await this.options.bringUp().catch((e: unknown) => this.options.log.warn(`account: ${String(e)}`))
  }
  stop(): void {
    this.remote.stop()
    this.signIn.cancel()
  }
  /** The device keys the public API accepts now, next to the keyring's own. */
  keys(): readonly string[] {
    return this.options.enabled() ? this.remote.keys() : []
  }
  /** A core event: the tunnel or the server changed, so the host reports it now. */
  event(name: string): void {
    if (name === 'remote-access:status' || name.startsWith('server:')) this.remote.wake()
  }
  view(): WorkspaceAccount {
    const user = this.session.user()
    return {
      enabled: this.options.enabled(),
      signed_in: user !== null,
      user: user
        ? { email: cleanText(user.email, 320) ?? '', display_name: cleanText(user.display_name) }
        : null,
      sign_in: this.signIn.view(),
      remote: this.remote.view(),
    }
  }
  private requireSignedIn(): void {
    if (!this.session.signedIn())
      throw new AtcError('ATC_ACCOUNT_REQUIRED', 'This server is not signed in to an Atomic Chat account.', {
        hint: 'Sign in with atc login.',
      })
  }
  async execute(operation: string, input: WorkspaceInput): Promise<unknown> {
    if (!this.options.enabled())
      throw new AtcError('ATC_ACCOUNT_DISABLED', 'Atomic Chat accounts are turned off on this server.', {
        hint: 'Turn them on with atc config set account.enabled true, then atc restart.',
      })
    await this.session.load()
    try {
      return await this.dispatch(operation, input)
    } catch (error) {
      return serviceFailure(error)
    }
  }
  private async dispatch(operation: string, input: WorkspaceInput): Promise<unknown> {
    switch (operation) {
      case 'account.status':
        return this.view()
      case 'account.signin.email.start':
        return this.signIn.emailStart(text(input['email']))
      case 'account.signin.email.verify':
        await this.signIn.emailVerify(text(input['code']))
        return this.view()
      case 'account.signin.device.start':
        return this.signIn.deviceStart()
      case 'account.signin.cancel':
        this.signIn.cancel()
        return this.view()
      case 'account.signout': {
        this.signIn.cancel()
        const confirmed = await this.session.signOut()
        if (!confirmed)
          this.options.log.warn('account: signed out here; the account service did not confirm it')
        return { ...this.view(), logout_confirmed: confirmed }
      }
      case 'account.remote.share':
        // Off works signed out too: a file another session left must always be stoppable.
        if (input['enabled'] !== true) {
          await this.remote.setSharing(false, input['forget'] === true)
          return this.view()
        }
        this.requireSignedIn()
        await this.options.bringUp()
        await this.remote.setSharing(true)
        return this.view()
    }
    this.requireSignedIn()
    switch (operation) {
      case 'account.remote.pairing.open':
        if (!this.remote.view().sharing)
          throw new AtcError('ATC_USAGE', 'Sharing is off.', { hint: 'Turn it on with atc remote share on.' })
        return this.remote.openPairing()
      case 'account.remote.pairing.close':
        await this.remote.closePairing()
        return this.view()
      case 'account.remote.decide':
        await this.remote.decide(text(input['grant_id']), input['allow'] === true)
        return this.view()
      case 'account.remote.revoke':
        await this.remote.revoke(text(input['grant_id']))
        return this.view()
    }
    throw new AtcError('ATC_USAGE', `No implementation for ${operation}.`)
  }
}
