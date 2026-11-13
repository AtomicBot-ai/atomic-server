/** Server → Remote access: "Your devices", the account's devices that share this server's API. */
import type { AccountRemoteDevice, AccountRemoteRequest, WorkspaceAccount } from '../../../contract/index.js'
import { deviceLabel, formatCheckCode, platformLabel, sharingLine } from '../../../workspace-view/index.js'
import { button, COLORS, text, textWidth, wrapWords } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { actionButton, panel } from '../draw/cards.js'
import type { WorkspaceState } from '../state.js'
import { deviceDetail, shownAccount } from './account-model.js'

export const DEVICES_TITLE = 'Your devices (Atomic Chat account)'
const SIGN_IN =
  'Sign in to share this server with your devices: Settings → Account, or run atc login in a terminal.'

type Row =
  | { kind: 'heading'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'request'; request: AccountRemoteRequest }
  | { kind: 'device'; device: AccountRemoteDevice }

/** The block's list: who asks for access first, then who has it. */
export function deviceRows(account: WorkspaceAccount): Row[] {
  const { requests, devices, sharing } = account.remote
  if (!requests.length && !devices.length)
    return [
      {
        kind: 'note',
        text: sharing ? 'No devices yet: press a to add one.' : 'Turn on sharing, then add a device.',
      },
    ]
  return [
    ...(requests.length ? [{ kind: 'heading' as const, text: 'Asking for access' }] : []),
    ...requests.map((request) => ({ kind: 'request' as const, request })),
    ...(devices.length ? [{ kind: 'heading' as const, text: 'Devices with access' }] : []),
    ...devices.map((device) => ({ kind: 'device' as const, device })),
  ]
}

/** Rows the block wants: its title, the sharing line and its actions, then the list; two more framed. */
export function devicesHeight(s: WorkspaceState, width: number, framed: boolean): number {
  const account = shownAccount(s.workspace)
  if (!account) return 0
  const inner = width - (framed ? 4 : 0)
  const body = account.signed_in ? 3 + deviceRows(account).length : 2 + wrapWords(SIGN_IN, inner).length
  return body + (framed ? 2 : 0)
}

function drawRow(c: Canvas, row: Row, x: number, y: number, width: number, focus: string) {
  if (row.kind === 'heading' || row.kind === 'note') {
    const heading = row.kind === 'heading'
    return text(c, x, y, row.text, heading ? COLORS.text : COLORS.muted, width, undefined, heading)
  }
  if (row.kind === 'request') {
    const r = row.request,
      platform = r.device_name ? platformLabel(r.platform) : ''
    const label = [deviceLabel(r), platform, `check code ${formatCheckCode(r.check_code)}`]
    text(c, x + 1, y, label.filter(Boolean).join(' · '), COLORS.text, width - 16)
    const hint = `Compare the check code ${formatCheckCode(r.check_code)} with the one on the device`
    button(c, `account-allow:${r.grant_id}`, x + width - 14, y, 'Allow', `Allow: ${hint}`, focus)
    button(c, `account-deny:${r.grant_id}`, x + width - 6, y, 'Deny', `Deny ${deviceLabel(r)}`, focus)
    return
  }
  const d = row.device,
    name = deviceLabel(d),
    detail = deviceDetail(d)
  text(c, x + 1, y, name, COLORS.text, width - 10)
  const after = textWidth(name)
  if (detail) text(c, x + 2 + after, y, `· ${detail}`, COLORS.muted, Math.max(0, width - 12 - after))
  button(c, `account-revoke:${d.grant_id}`, x + width - 8, y, 'Revoke', `Revoke ${name}`, focus)
}

function drawActions(
  c: Canvas,
  s: WorkspaceState,
  account: WorkspaceAccount,
  x: number,
  y: number,
  focus: string
) {
  if (s.busy) return text(c, x + 1, y, 'Updating…', COLORS.muted)
  const sharing = account.remote.sharing
  const at =
    x +
    actionButton(
      c,
      'account-share',
      x,
      y,
      sharing ? 'Stop sharing  [s]' : 'Share with my devices  [s]',
      sharing
        ? 'Stop sharing; paired devices stay paired'
        : 'Share the API with your devices; starts the API and the tunnel',
      focus
    )
  if (sharing)
    button(
      c,
      'account-pair',
      at + 1,
      y,
      'Add a device  [a]',
      'Show a pairing code, its link and QR code',
      focus
    )
}

/**
 * The block at `y` in at most `room` rows, framed by a card or not; the rows it took, 0 while accounts are
 * off. The list shows what fits and says how many more there are.
 */
export function drawRemoteDevices(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  room: number,
  focus: string,
  framed: boolean
): number {
  const account = shownAccount(s.workspace)
  if (!account) return 0
  const height = Math.max(framed ? 5 : 3, Math.min(room, devicesHeight(s, width, framed)))
  const inset = framed ? 2 : 0,
    left = x + inset,
    inner = width - inset * 2,
    top = y + (framed ? 1 : 0),
    rows = height - (framed ? 2 : 0)
  if (framed) panel(c, x, y, width, height)
  text(c, left, top, DEVICES_TITLE, COLORS.text, inner, undefined, true)
  if (!account.signed_in) {
    const lines = wrapWords(SIGN_IN, inner).slice(0, Math.max(0, rows - 2))
    lines.forEach((line, i) => text(c, left, top + 1 + i, line, COLORS.muted, inner))
    button(
      c,
      'settings-section:account',
      left - (framed ? 1 : 0),
      top + rows - 1,
      'Sign in',
      'Open Settings → Account',
      focus
    )
    return height
  }
  const error = account.remote.sharing && account.remote.error
  text(c, left, top + 1, sharingLine(account.remote), error ? COLORS.statusError : COLORS.muted, inner)
  drawActions(c, s, account, left - (framed ? 1 : 0), top + 2, focus)
  const list = deviceRows(account),
    capacity = Math.max(0, rows - 3),
    clipped = list.length > capacity
  list
    .slice(0, clipped ? capacity - 1 : capacity)
    .forEach((row, i) => drawRow(c, row, left, top + 3 + i, inner, focus))
  if (clipped && capacity > 0)
    text(c, left + 1, top + 2 + capacity, `… ${list.length - capacity + 1} more`, COLORS.muted, inner)
  return height
}
