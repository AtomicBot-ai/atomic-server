/** The account dialogs: email sign-in, sign-in on another device, sign-out; pairing ones are next door. */
import { countdown } from '../../../workspace-view/index.js'
import type { WorkspaceAccount } from '../../../contract/index.js'
import { button, COLORS } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { fieldControl } from '../draw/controls.js'
import type { WorkspaceState } from '../state.js'
import { accountUi, shownAccount } from './account-model.js'
import { drawPairingDialog, drawRevokeDialog } from './pairing-dialog.js'
import { buttonRow, dialog, writer } from './dialog-frame.js'

function drawEmail(c: Canvas, s: WorkspaceState, focus: string) {
  const ui = accountUi(s),
    code = ui.step === 'code'
  const d = dialog(c, 62, 13),
    w = writer(c, d, 1)
  w.put(code ? 'Enter the code' : 'Email me a code', COLORS.text, true, true)
  w.skip()
  w.put(
    code
      ? ui.email
        ? `We sent a 6-digit code to ${ui.email.trim()}.`
        : 'Enter the 6-digit code from the email.'
      : 'Email address',
    COLORS.muted
  )
  const value = (code ? ui.code : ui.email) + (focus === 'account-field' ? '_' : '')
  const hint = code ? 'The 6-digit code from the email' : 'The address to send a sign-in code to'
  fieldControl(c, 'account-field', d.x + 2, d.y + w.row, d.w - 4, value, hint, focus)
  w.skip(2)
  if (ui.error) w.put(ui.error, COLORS.statusError)
  const busy = s.busy ? (code ? 'Signing in…' : 'Sending…') : ''
  buttonRow(
    c,
    d.x + 2,
    d.y + d.h - 3,
    [
      code
        ? ['account-email-verify', busy || 'Sign in', 'Sign this server in']
        : ['account-email-send', busy || 'Send code', 'Email me a sign-in code'],
      ...(code
        ? [['account-email-back', 'Use another email', 'Send a code to another address'] as const]
        : []),
      ['close', 'Cancel', 'Close without signing in'],
    ],
    focus
  )
}

function drawDevice(c: Canvas, account: WorkspaceAccount | null, now: number, focus: string) {
  const step = account?.sign_in
  const d = dialog(c, 72, 15),
    w = writer(c, d, 1),
    row = d.y + d.h - 3
  w.put('Sign in on another device', COLORS.text, true, true)
  w.skip()
  if (step?.state === 'failed') {
    w.put(step.message, COLORS.statusError)
    const retry = ['account-device-retry', 'Try again', 'Get a new code'] as const
    return buttonRow(c, d.x + 2, row, [retry, ['close', 'Close', 'Close this dialog']], focus)
  }
  if (step?.state !== 'device') {
    w.put('Starting…', COLORS.muted)
    button(c, 'close', d.x + 2, row, 'Cancel', 'Close', focus)
    return
  }
  w.put('Open this link in any browser where you can sign in:', COLORS.muted)
  w.put(step.verification_uri_complete, COLORS.accent, false)
  w.skip()
  w.put(`or open ${step.verification_uri} and enter the code`, COLORS.muted)
  w.put(step.user_code, COLORS.accent, false, true)
  w.skip()
  w.put(`Waiting for approval… the code expires in ${countdown(step.expires_at, now)}`, COLORS.muted)
  buttonRow(
    c,
    d.x + 2,
    row,
    [
      ['account-device-open', 'Open link', 'Open the link in a browser on this computer'],
      ['account-device-copy', 'Copy link', 'Copy the link to the clipboard'],
      ['close', 'Cancel', 'Cancel this sign-in'],
    ],
    focus
  )
}

function drawSignOut(c: Canvas, account: WorkspaceAccount | null, focus: string) {
  const devices = account?.remote.devices.length ?? 0
  const d = dialog(c, 62, 10),
    w = writer(c, d, 1),
    row = d.y + d.h - 3
  w.put('Sign this server out?', COLORS.text, true, true)
  w.skip()
  w.put(
    devices
      ? `${devices} device${devices === 1 ? '' : 's'} will lose access to this server and must pair again.`
      : 'Devices that use this server through your account lose access and must pair again.'
  )
  buttonRow(
    c,
    d.x + 2,
    row,
    [
      ['account-signout-confirm', 'Sign out', 'Sign this server out now'],
      ['close', 'Keep signed in', 'Cancel without changes'],
    ],
    focus
  )
}

/** Draws the open account dialog; false when another overlay is open. */
export function drawAccountOverlay(c: Canvas, s: WorkspaceState, focus: string): boolean {
  const account = shownAccount(s.workspace),
    now = accountUi(s).now
  if (s.overlay === 'account-email') drawEmail(c, s, focus)
  else if (s.overlay === 'account-device') drawDevice(c, account, now, focus)
  else if (s.overlay === 'account-signout') drawSignOut(c, account, focus)
  else if (s.overlay === 'account-pairing') drawPairingDialog(c, s, focus)
  else if (s.overlay === 'account-revoke') drawRevokeDialog(c, s, focus)
  else return false
  return true
}
