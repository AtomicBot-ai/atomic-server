/**
 * Signing this server in, without a browser on it: a one-time code sent to an email address, or a device
 * code the person approves on another device (the account service's activate page, where Google sign-in
 * also works). The challenge and the device code live in memory only; a restart starts over.
 */
import { AtcError } from '../errors/index.js'
import type { AccountSignInStep } from '../contract/index.js'
import { AccountApiError, type AccountCall } from './account-api.js'
import type { TokenResponse } from './account-store.js'
import type { ClientInfo } from './client-info.js'
import type { AccountSession } from './session.js'
import { serviceFailure } from './failures.js'
import { cleanText } from './text.js'

const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'
const SLOW_DOWN_MS = 5_000
/** RFC 8628's default and floor: never poll faster than every 5 s, whatever an answer says. */
const MIN_INTERVAL_MS = 5_000

/** Seconds from the service, clamped to a sane range; `fallback` when not a number. */
const seconds = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = Number(value)
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : fallback)) * 1000
}

/** An address to open in a browser: https only (plain http only on this machine, for a test backend). */
function browserUrl(value: unknown): string {
  try {
    const url = new URL(String(value))
    if (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))
    )
      return url.href
  } catch {
    // Not a URL: refused below.
  }
  throw new AccountApiError(502, 'bad_verification_uri')
}

export interface SignInOptions {
  call: AccountCall
  session: AccountSession
  client: () => Promise<ClientInfo>
  now?: () => number
  /** Test seam: how the next device poll is scheduled. */
  schedule?: (work: () => void, ms: number) => () => void
}

interface EmailChallenge {
  id: string
  expiresAt: number
}
interface DeviceFlow {
  deviceCode: string
  intervalMs: number
  expiresAt: number
  cancel: () => void
}

const defaultSchedule = (work: () => void, ms: number) => {
  const timer = setTimeout(work, ms)
  timer.unref?.()
  return () => clearTimeout(timer)
}

export class SignIn {
  private step: AccountSignInStep = { state: 'idle' }
  private challenge: EmailChallenge | null = null
  private device: DeviceFlow | null = null
  constructor(private readonly options: SignInOptions) {}
  private now(): number {
    return (this.options.now ?? Date.now)()
  }
  view(): AccountSignInStep {
    if (this.step.state === 'device' && this.now() > this.step.expires_at) return this.failed('expired')
    return this.step
  }
  private failed(reason: 'denied' | 'expired' | 'error', message?: string): AccountSignInStep {
    this.stopDevice()
    const text =
      message ??
      (reason === 'denied'
        ? 'The sign-in was declined.'
        : reason === 'expired'
          ? 'The sign-in code expired. Start again.'
          : 'The sign-in did not finish.')
    this.step = { state: 'failed', reason, message: text }
    return this.step
  }
  private async notSignedIn(): Promise<void> {
    await this.options.session.load()
    // Signing in again would replace this install's session, and with it every device's access.
    if (this.options.session.signedIn())
      throw new AtcError('ATC_ACCOUNT_SIGNED_IN', 'This server is already signed in.', {
        hint: 'Sign out first (atc logout); devices that use this server will need to pair again.',
      })
  }
  /** Send a one-time code to `email`. */
  async emailStart(email: string): Promise<AccountSignInStep> {
    await this.notSignedIn()
    const address = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 320)
      throw new AtcError('ATC_USAGE', 'Enter a valid email address.')
    this.cancel()
    const answer = await this.options
      .call<{ challenge_id: string; expires_in: number; resend_in: number }>('POST', '/v1/auth/email/start', {
        body: { email: address, client: await this.options.client() },
      })
      .catch((error: unknown) => serviceFailure(error))
    const now = this.now()
    this.challenge = { id: answer.challenge_id, expiresAt: now + seconds(answer.expires_in, 600, 60, 3600) }
    this.step = {
      state: 'email_sent',
      expires_at: this.challenge.expiresAt,
      resend_at: now + seconds(answer.resend_in, 60, 0, 3600),
    }
    return this.step
  }
  /** Finish an email sign-in with the 6-digit code from the email. */
  async emailVerify(code: string): Promise<void> {
    await this.notSignedIn()
    const digits = code.replace(/\D/g, '')
    if (!this.challenge || this.now() > this.challenge.expiresAt)
      throw new AtcError('ATC_USAGE', 'No code is waiting for this server.', {
        hint: 'Ask for a new code first (atc login --email <address>).',
      })
    if (digits.length !== 6) throw new AtcError('ATC_USAGE', 'The code has 6 digits.')
    const tokens = await this.options
      .call<TokenResponse>('POST', '/v1/auth/email/verify', {
        body: { challenge_id: this.challenge.id, code: digits, client: await this.options.client() },
      })
      .catch((error: unknown) => {
        if (error instanceof AccountApiError && error.is('invalid_code')) {
          const left = Number(error.body['attempts_left'])
          throw new AtcError(
            'ATC_USAGE',
            Number.isFinite(left) ? `Wrong code; ${left} attempts left.` : 'Wrong code.'
          )
        }
        if (
          error instanceof AccountApiError &&
          ['too_many_attempts', 'code_expired', 'invalid_challenge'].includes(error.code)
        ) {
          this.challenge = null
          this.step = { state: 'idle' }
          throw new AtcError('ATC_USAGE', 'That code can no longer be used. Ask for a new one.')
        }
        return serviceFailure(error)
      })
    this.challenge = null
    this.step = { state: 'idle' }
    await this.options.session.adopt(tokens)
  }
  /** Show a code to approve on another device; the server polls until it is approved, declined or expired. */
  async deviceStart(): Promise<AccountSignInStep> {
    await this.notSignedIn()
    this.cancel()
    const answer = await this.options
      .call<{
        device_code: string
        user_code: string
        verification_uri: string
        verification_uri_complete: string
        expires_in: number
        interval: number
      }>('POST', '/v1/auth/device/code', { body: { client: await this.options.client() } })
      .catch((error: unknown) => serviceFailure(error))
    const userCode = cleanText(answer.user_code, 16)
    let links: [string, string]
    try {
      links = [browserUrl(answer.verification_uri), browserUrl(answer.verification_uri_complete)]
    } catch (error) {
      return serviceFailure(error)
    }
    if (!userCode || typeof answer.device_code !== 'string')
      return serviceFailure(new AccountApiError(502, 'bad_device_code'))
    const expiresAt = this.now() + seconds(answer.expires_in, 900, 60, 1800)
    this.device = {
      deviceCode: answer.device_code,
      intervalMs: Math.max(MIN_INTERVAL_MS, seconds(answer.interval, 5, 0, 60)),
      expiresAt,
      cancel: () => undefined,
    }
    this.step = {
      state: 'device',
      user_code: userCode,
      verification_uri: links[0],
      verification_uri_complete: links[1],
      expires_at: expiresAt,
    }
    this.pollLater(this.device)
    return this.step
  }
  private pollLater(flow: DeviceFlow): void {
    const schedule = this.options.schedule ?? defaultSchedule
    flow.cancel = schedule(() => void this.poll(flow), flow.intervalMs)
  }
  private async poll(flow: DeviceFlow): Promise<void> {
    if (this.device !== flow) return
    if (this.now() > flow.expiresAt) return void this.failed('expired')
    try {
      const tokens = await this.options.call<TokenResponse>('POST', '/v1/auth/token', {
        body: { grant_type: DEVICE_GRANT, device_code: flow.deviceCode },
      })
      if (this.device !== flow) return
      this.device = null
      this.step = { state: 'idle' }
      await this.options.session.adopt(tokens)
    } catch (error) {
      if (this.device !== flow) return
      const code = error instanceof AccountApiError ? error.code : ''
      if (code === 'access_denied') return void this.failed('denied')
      if (code === 'expired_token' || code === 'invalid_grant') return void this.failed('expired')
      if (code === 'slow_down') {
        // RFC 8628: slow down by 5 s; a longer interval the answer names wins, a shorter one never does.
        const named = seconds(error instanceof AccountApiError ? error.body['interval'] : NaN, 0, 0, 60)
        flow.intervalMs = Math.max(flow.intervalMs + SLOW_DOWN_MS, named)
      }
      // Pending, slow down, or the network: ask again after the interval.
      this.pollLater(flow)
    }
  }
  private stopDevice(): void {
    this.device?.cancel()
    this.device = null
  }
  /** Drop a sign-in in progress. */
  cancel(): void {
    this.stopDevice()
    this.challenge = null
    this.step = { state: 'idle' }
  }
}
