/**
 * The Atomic Chat account as the server shows it (`snapshot.account`): who is signed in, how far a sign-in
 * got, and this server's remote access host. Never a token, a key, a pairing code or an address.
 */

/** Where a sign-in started from this server stands. */
export type AccountSignInStep =
  | { state: 'idle' }
  /** A code went to the address; `account.signin.email.verify` takes it. */
  | { state: 'email_sent'; expires_at: number; resend_at: number }
  /** Waiting for the person to approve this code on any signed-in device or the activate page. */
  | {
      state: 'device'
      user_code: string
      verification_uri: string
      verification_uri_complete: string
      expires_at: number
    }
  | { state: 'failed'; reason: 'denied' | 'expired' | 'error'; message: string }

/** A device asking for access ("Allow"), with the check code both screens show. */
export interface AccountRemoteRequest {
  grant_id: string
  device_name: string | null
  platform: string | null
  client_type: string
  check_code: string
  created_at: string
}

/** A device that holds a key for this server's API. */
export interface AccountRemoteDevice {
  grant_id: string
  device_name: string | null
  platform: string | null
  /** ms since the epoch */
  since: number
}

/**
 * A device whose access ended other than from this server: it disconnected, another device of the account
 * revoked it, or it signed out. Stopping sharing or Revoke here lists nothing: the person did that.
 */
export interface AccountRemoteEnded {
  grant_id: string
  device_name: string | null
  platform: string | null
  /** ms since the epoch */
  at: number
}

export interface WorkspaceRemoteHost {
  /**
   * The person turned sharing on; it stays on across restarts until turned off. Turning it off ends every
   * device's access: each pairs again next time.
   */
  sharing: boolean
  /** The name devices see, once this server is registered as a host. */
  host_name: string | null
  /** The tunnel as the account service is told it. */
  tunnel: 'online' | 'off' | 'error'
  /** The API listens on the network (`api.host` 0.0.0.0) and LAN addresses are offered. */
  lan: boolean
  /** How many addresses devices get now: 0 means sharing is on but nothing can reach this server. */
  addresses: number
  /** An open pairing code, without the code itself: it is only in the answer that opened it. */
  pairing: { expires_at: number } | null
  requests: AccountRemoteRequest[]
  devices: AccountRemoteDevice[]
  /** Devices whose access ended from their side, newest first: the last few minutes, at most five. */
  ended: AccountRemoteEnded[]
  /** The last failure talking to the account service, for a status line; null once a round succeeds. */
  error: string | null
}

export interface WorkspaceAccount {
  /** `account.enabled`: while false, clients show nothing of the account. */
  enabled: boolean
  signed_in: boolean
  user: { email: string; display_name: string | null } | null
  sign_in: AccountSignInStep
  remote: WorkspaceRemoteHost
}

/** `account.remote.pairing.open`: the only place a pairing code and its QR link appear. */
export interface AccountPairingCode {
  /** `BCDF-GHJK`, to type on the device. */
  code: string
  /** `atomic-chat://remote/pair?c=…&k=…`: paste it into the app, or scan it as a QR code. */
  link: string
  /** ms since the epoch */
  expires_at: number
  /** The link as an SVG QR code, for the web admin. */
  qr_svg: string
}
