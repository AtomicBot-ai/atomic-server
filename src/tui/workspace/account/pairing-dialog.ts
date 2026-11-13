/** "Add a device": the pairing code, its link and QR code, and its countdown; and revoking a device. */
import { qrTerminal } from '../../../account/index.js'
import { countdown, deviceLabel } from '../../../workspace-view/index.js'
import { COLORS, text, textWidth } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { buttonRow, dialog, writer } from './dialog-frame.js'
import { accountUi, shownAccount } from './account-model.js'

/** Text beside the QR code needs this many columns; below it the code shows without one. */
const SIDE = 34
const INSTRUCTIONS =
  'In Atomic Chat on your device, add this server: enter the code, scan the QR code or paste the link.'

let cached = { link: '', rows: [] as string[] }
/** The QR code's rows, made once per link: a frame is drawn on every key and tick. */
export function qrRows(link: string): string[] {
  if (cached.link !== link) cached = { link, rows: qrTerminal(link).split('\n') }
  return cached.rows
}

export function drawPairingDialog(c: Canvas, s: WorkspaceState, focus: string) {
  const ui = accountUi(s),
    pairing = ui.pairing
  if (!pairing) return
  const qr = qrRows(pairing.link),
    qrWidth = textWidth(qr[0] ?? '')
  const withQr = c.height - 6 >= qr.length + 3 && c.width - 6 >= qrWidth + 6 + SIDE
  const d = withQr ? dialog(c, qrWidth + 6 + SIDE, qr.length + 3) : dialog(c, 64, 17)
  const expired = ui.now >= pairing.expires_at
  // The QR code is light modules on the terminal's dark ground, as `qrencode -t UTF8` draws it.
  if (withQr)
    qr.forEach((line, i) => text(c, d.x + 2, d.y + 2 + i, line, COLORS.text, qrWidth, COLORS.ground))
  const side = withQr ? { ...d, x: d.x + qrWidth + 2, w: d.w - qrWidth - 2 } : d
  const w = writer(c, side, 1)
  w.put('Add a device', COLORS.text, true, true)
  w.skip()
  w.put('Code', COLORS.muted)
  w.put(pairing.code, expired ? COLORS.muted : COLORS.accent, false, true)
  w.put(
    expired ? 'This code expired.' : `Expires in ${countdown(pairing.expires_at, ui.now)}`,
    expired ? COLORS.statusError : COLORS.muted
  )
  w.skip()
  w.put(INSTRUCTIONS, COLORS.muted)
  w.skip()
  w.put(pairing.link, COLORS.text, false)
  if (!withQr) w.put('Make the terminal larger to show the QR code.', COLORS.muted)
  buttonRow(
    c,
    side.x + 2,
    d.y + d.h - 3,
    expired
      ? [
          ['account-pair', 'New code', 'Open a new pairing code'],
          ['close', 'Close', 'Close this dialog'],
        ]
      : [
          ['account-pair-copy', 'Copy link', 'Copy the pairing link to paste into the app'],
          ['account-pair-code', 'Copy code', 'Copy the code'],
          ['close', 'Close', 'Close the code; it stops working'],
        ],
    focus
  )
}

export function drawRevokeDialog(c: Canvas, s: WorkspaceState, focus: string) {
  const grant = accountUi(s).grant
  const device = shownAccount(s.workspace)?.remote.devices.find((d) => d.grant_id === grant)
  const name = device ? deviceLabel(device) : 'This device'
  const d = dialog(c, 62, 10),
    w = writer(c, d, 1)
  w.put('Revoke this device?', COLORS.text, true, true)
  w.skip()
  w.put(`${name} loses access to this server from its next request. It can pair again with a new code.`)
  buttonRow(
    c,
    d.x + 2,
    d.y + d.h - 3,
    [
      ['account-revoke-confirm', 'Revoke device', 'Revoke its key now'],
      ['close', 'Keep it', 'Cancel without changes'],
    ],
    focus
  )
}
