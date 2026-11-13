/** Account → Remote models: share this server's models with the account's devices, and who uses them. */
import type { AccountRemoteDevice, AccountRemoteRequest, WorkspaceAccount } from '../../../contract/index.js'
import { deviceLabel, formatCheckCode, platformLabel, sharingLine } from '../../../workspace-view/index.js'
import { button, COLORS, text, textWidth, wrapWords } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { actionButton } from '../draw/cards.js'
import type { WorkspaceState } from '../state.js'
import { deviceDetail } from './account-model.js'
import { drawSignIn } from './account-panel.js'

export const REMOTE_TITLE = 'Share with your devices'
const INTRO =
  'Devices signed in to your Atomic Chat account can use this server’s models through its API. Each device pairs once and gets its own key.'
const SIGN_IN = 'Sign in to share this server’s models with your devices.'
/** Rows the intro needs room for: below this the list keeps them. */
const INTRO_ROOM = 14

type Row =
  | { kind: 'heading'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'request'; request: AccountRemoteRequest }
  | { kind: 'device'; device: AccountRemoteDevice }

/** The list: who asks for access first, then who has it. */
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
        ? 'Stop sharing; every device loses access and must pair again'
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
 * The Remote models tab of a shown account, from `y` to `bottom`: the sign-in while nobody is signed in,
 * else the share switch, Add a device and the list, which shows what fits and says how many more there are.
 */
export function drawRemoteModels(
  c: Canvas,
  s: WorkspaceState,
  account: WorkspaceAccount,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  text(c, x, y, REMOTE_TITLE, COLORS.text, width, undefined, true)
  if (!account.signed_in) {
    const lines = wrapWords(SIGN_IN, width).slice(0, 2)
    lines.forEach((line, i) => text(c, x, y + 2 + i, line, COLORS.muted, width))
    return drawSignIn(c, s, account, x, y + 3 + lines.length, width, focus)
  }
  const intro = bottom - y + 1 >= INTRO_ROOM ? wrapWords(INTRO, width).slice(0, 2) : []
  intro.forEach((line, i) => text(c, x, y + 2 + i, line, COLORS.muted, width))
  let row = y + 2 + (intro.length ? intro.length + 1 : 0)
  const error = account.remote.sharing && account.remote.error
  text(c, x, row++, sharingLine(account.remote), error ? COLORS.statusError : COLORS.muted, width)
  drawActions(c, s, account, x, row, focus)
  row += 2
  const list = deviceRows(account),
    capacity = Math.max(0, bottom - row + 1),
    clipped = list.length > capacity
  list
    .slice(0, clipped ? capacity - 1 : capacity)
    .forEach((item, i) => drawRow(c, item, x, row + i, width, focus))
  if (clipped && capacity > 0)
    text(c, x + 1, row + capacity - 1, `… ${list.length - capacity + 1} more`, COLORS.muted, width)
}
