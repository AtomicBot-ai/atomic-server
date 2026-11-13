import type {
  AccountRemoteDevice,
  AccountRemoteRequest,
  WorkspaceAccount,
  WorkspaceRemoteHost,
} from '../../contract/index.js'

/** How often a client polls `account.status` while a device sign-in or a pairing code waits. */
export const ACCOUNT_POLL_MS = 2_000

const PLATFORMS: Record<string, string> = {
  'macos': 'macOS',
  'windows': 'Windows',
  'linux': 'Linux',
  'ios': 'iOS',
  'android': 'Android',
  'atc-darwin': 'macOS',
  'atc-linux': 'Linux',
  'atc-win32': 'Windows',
}

/** `atc-linux` → Linux, `ios` → iOS; anything else as it came, and nothing for none. */
export const platformLabel = (platform: string | null | undefined): string =>
  platform ? (PLATFORMS[platform] ?? platform) : ''

/** A device as a person names it: its name, else its platform, else "A device". */
export function deviceLabel(device: Pick<AccountRemoteDevice, 'device_name' | 'platform'>): string {
  return device.device_name || platformLabel(device.platform) || 'A device'
}

/** The account line both clients show: who is signed in, or why nobody is. */
export function accountLine(account: WorkspaceAccount | undefined): string {
  if (!account?.enabled) return 'Accounts are off on this server'
  if (account.user) return `Signed in as ${account.user.display_name || account.user.email}`
  return 'Not signed in'
}

/** Where devices can reach this server, in words; the first thing to fix when they cannot. */
export function sharingLine(remote: WorkspaceRemoteHost | undefined): string {
  if (!remote?.sharing) return 'Not shared with your devices'
  if (remote.error) return `Sharing is on, but ${remote.error}`
  if (remote.addresses === 0)
    return remote.tunnel === 'error'
      ? 'Sharing is on, but the tunnel failed and the API does not listen on the network'
      : 'Sharing is on; waiting for the tunnel'
  const routes = [remote.tunnel === 'online' ? 'internet' : '', remote.lan ? 'local network' : '']
    .filter(Boolean)
    .join(' and ')
  return `Shared with your devices over the ${routes}`
}

/** The newest request, as a one-line notice: compare the check code before allowing it. */
export function requestNotice(account: WorkspaceAccount | undefined): string | null {
  const request: AccountRemoteRequest | undefined = account?.remote.requests.at(-1)
  if (!request) return null
  return `${deviceLabel(request)} asks for access to this server — check code ${request.check_code}`
}

/** `123456` → `123 456`: easier to compare across two screens. */
export const formatCheckCode = (code: string): string =>
  code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code

/** Minutes and seconds left of a code, `9:58`; `0:00` once expired. */
export function countdown(expiresAt: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
