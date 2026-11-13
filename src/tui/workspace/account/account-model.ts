/** The account as the terminal shows it: what this client keeps of a flow, and what it may show at all. */
import type {
  ACCOUNT_SECTIONS,
  AccountPairingCode,
  AccountRemoteDevice,
  AccountRemoteEnded,
  WorkspaceAccount,
  WorkspaceSnapshot,
} from '../../../contract/index.js'
import {
  accountLine,
  deviceLabel,
  endedNotice,
  platformLabel,
  requestNotice,
} from '../../../workspace-view/index.js'
import type { WorkspaceOverlay } from '../overlay-types.js'
import type { WorkspaceState } from '../state.js'

/** What this terminal keeps of an account flow: the fields being typed, the pairing code it opened, a clock. */
export interface AccountUi {
  /** The email sign-in asks for the address, then for the code sent to it. */
  step: 'email' | 'code'
  email: string
  code: string
  /** Why the last step in an open dialog failed. */
  error: string
  /** The open pairing code: only the answer that opened it holds the code and the link. */
  pairing: AccountPairingCode | null
  /** Devices with access when the code opened: one more means the code was used. */
  known: string[]
  /** The device a confirmation revokes. */
  grant: string
  /** The clock countdowns read (ms since the epoch), ticked while a code is on screen. */
  now: number
}

export const accountUi = (s: Pick<WorkspaceState, 'accountUi'>, now = 0): AccountUi =>
  s.accountUi ?? {
    step: 'email',
    email: '',
    code: '',
    error: '',
    pairing: null,
    known: [],
    grant: '',
    now,
  }

export const ACCOUNT_OVERLAYS = [
  'account-email',
  'account-device',
  'account-signout',
  'account-pairing',
  'account-revoke',
  'account-stop-sharing',
] as const satisfies readonly NonNullable<WorkspaceOverlay>[]

export const isAccountOverlay = (overlay: WorkspaceOverlay): boolean =>
  (ACCOUNT_OVERLAYS as readonly string[]).includes(overlay ?? '')

/** The account as this terminal may show it: nothing at all while accounts are off on the server. */
export function shownAccount(workspace: WorkspaceSnapshot | null | undefined): WorkspaceAccount | null {
  return workspace?.account?.enabled === true ? workspace.account : null
}

/** A tab of the Account page: Overview or Remote models. */
export type AccountView = (typeof ACCOUNT_SECTIONS)[number]['id']

/** The Account page open on `view`, focus on `focus`: the tab's sidebar row unless said otherwise. */
export function onAccountTab(view: AccountView, focus = `account-section:${view}`) {
  return { page: 'account' as const, accountView: view, serverView: 'overview', focus, hover: '' }
}

/** A sign-in that just finished: the tab it started on, focus on what comes next there. */
export function signedIn(s: WorkspaceState, account: WorkspaceAccount): Partial<WorkspaceState> {
  const view = s.page === 'account' ? s.accountView : 'overview'
  return {
    ...onAccountTab(view, view === 'remote' ? 'account-share' : 'account-section:remote'),
    overlay: null,
    message: `${accountLine(account)}.`,
  }
}

/** The status line's account notice: a device asking for access. */
export function accountNotice(workspace: WorkspaceSnapshot | null | undefined): string | null {
  const account = shownAccount(workspace)
  return account ? requestNotice(account) : null
}

const endedKey = (ended: AccountRemoteEnded) => `${ended.grant_id}@${ended.at}`

/** Devices whose access ended from their side, as one notice: the newest by name, and how many more. */
function endedText(ended: readonly AccountRemoteEnded[]): string {
  const newest = ended.reduce((a, b) => (b.at > a.at ? b : a))
  return `${endedNotice(newest)}${ended.length > 1 ? ` (and ${ended.length - 1} more)` : ''}.`
}

/**
 * `next`, the state once an account landed on `before`, with each device whose access ended said once on
 * the status line and remembered in `accountEnded`. The first account this terminal sees is old news. A
 * notice waits, unsaid, while something hides the status line or this update set its own message; it is
 * said by a later update. Only entries the server still lists are remembered.
 */
export function announceEnded(before: WorkspaceState, next: WorkspaceState): WorkspaceState {
  const account = shownAccount(next.workspace)
  if (!account) return next
  // A server older than this terminal sends no `ended`.
  const listed = account.remote.ended ?? [],
    keys = listed.map(endedKey)
  const said = next.accountEnded
  if (!said) return { ...next, accountEnded: keys }
  const fresh = listed.filter((ended) => !said.includes(endedKey(ended)))
  const hidden = Boolean(next.overlay) || (next.page === 'chat' && Boolean(next.chatNotice))
  const ownMessage = next.message !== '' && next.message !== before.message
  if (fresh.length && !hidden && !ownMessage)
    return { ...next, message: endedText(fresh), accountEnded: keys }
  const kept = said.filter((key) => keys.includes(key))
  return kept.length === said.length ? next : { ...next, accountEnded: kept }
}

/** The line at the end of setup, while nobody is signed in. */
export function setupAccountHint(workspace: WorkspaceSnapshot | null | undefined): string | null {
  const account = shownAccount(workspace)
  return account && !account.signed_in ? 'Share this server with your devices: atc login' : null
}

/** The device a pairing code let in: the server closed the code and a device not there before has access. */
export function pairedDevice(ui: AccountUi, account: WorkspaceAccount | null): AccountRemoteDevice | null {
  if (!ui.pairing || !account || account.remote.pairing !== null) return null
  return account.remote.devices.find((device) => !ui.known.includes(device.grant_id)) ?? null
}

/** An answer of the server put into the snapshot this terminal shows. */
export function withAccount(s: WorkspaceState, account: WorkspaceAccount): WorkspaceState {
  return s.workspace ? { ...s, workspace: { ...s.workspace, account } } : s
}

/**
 * A fresh account status: kept in the snapshot, and the end of a dialog waiting on it — the device sign-in
 * once the server is signed in, the pairing code once a new device used it. A device that disconnected is
 * said as `announceEnded` says it.
 */
export function accountArrived(s: WorkspaceState, account: WorkspaceAccount, now: number): WorkspaceState {
  return announceEnded(s, arrived(s, account, now))
}

function arrived(s: WorkspaceState, account: WorkspaceAccount, now: number): WorkspaceState {
  const next = withAccount(s, account),
    ui = accountUi(s, now)
  if (s.overlay === 'account-device' && account.signed_in) return { ...next, ...signedIn(s, account) }
  const device = s.overlay === 'account-pairing' ? pairedDevice(ui, account) : null
  if (device)
    return {
      ...next,
      ...onAccountTab('remote', 'account-pair'),
      overlay: null,
      accountUi: { ...ui, pairing: null, known: [], now },
      message: `${deviceLabel(device)} can now use this server.`,
    }
  return { ...next, ...(s.accountUi ? { accountUi: { ...s.accountUi, now } } : {}) }
}

/** A device's second line: its platform when it has a name, and since when it has access. */
export function deviceDetail(device: AccountRemoteDevice): string {
  const since = device.since ? `since ${new Date(device.since).toISOString().slice(0, 10)}` : ''
  return [device.device_name ? platformLabel(device.platform) : '', since].filter(Boolean).join(' · ')
}
