/** Settings → Account: who this server is signed in as, signing in, and signing out. */
import { accountLine, sharingLine } from '../../../workspace-view/index.js'
import type { WorkspaceAccount } from '../../../contract/index.js'
import { button, COLORS, text, wrapWords } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { actionButton } from '../draw/cards.js'
import type { WorkspaceState } from '../state.js'
import { shownAccount } from './account-model.js'

const INTRO =
  'Sign in to share this server’s API with the devices on your Atomic Chat account: the desktop app now, mobile later. Each device pairs once and gets its own key.'

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** How many devices use this server and how many ask to. */
export function devicesLine(account: WorkspaceAccount): string {
  const { devices, requests } = account.remote
  const parts = [
    devices.length ? `${plural(devices.length, 'device')} with access` : 'No devices yet',
    requests.length ? `${requests.length} asking for access` : '',
  ]
  return parts.filter(Boolean).join(' · ')
}

function drawSignedIn(
  c: Canvas,
  account: WorkspaceAccount,
  x: number,
  y: number,
  width: number,
  focus: string
) {
  const email = account.user?.email ?? ''
  if (account.user?.display_name) text(c, x, y++, email, COLORS.muted, width)
  y++
  text(c, x, y++, 'Your devices', COLORS.text, width, undefined, true)
  text(c, x, y++, sharingLine(account.remote), COLORS.muted, width)
  text(c, x, y++, devicesLine(account), COLORS.muted, width)
  button(c, 'server-section:remote', x, ++y, 'Manage devices', 'Open Server → Remote access', focus)
  y += 2
  const hint = 'Sign this server out; every device that uses it loses access and must pair again'
  const at = x + 1 + button(c, 'account-signout', x, y, 'Sign out', hint, focus)
  text(c, at, y, 'Devices lose access and must pair again.', COLORS.muted, x + width - at)
}

function drawSignedOut(
  c: Canvas,
  s: WorkspaceState,
  account: WorkspaceAccount,
  x: number,
  y: number,
  width: number,
  focus: string
) {
  const intro = wrapWords(INTRO, width).slice(0, 4)
  intro.forEach((line, i) => text(c, x, y + i, line, COLORS.muted, width))
  y += intro.length + 1
  const step = account.sign_in
  if (s.busy) text(c, x, y, 'Starting…', COLORS.muted, width)
  else {
    const at =
      x +
      actionButton(c, 'account-email', x, y, 'Email me a code', 'Sign in with a code sent by email', focus)
    button(
      c,
      'account-device',
      at + 2,
      y,
      step.state === 'device' ? 'Show the sign-in code' : 'Sign in on another device',
      'Approve this server from any browser where you can sign in, Google included',
      focus
    )
  }
  y += 2
  if (step.state === 'email_sent') {
    text(c, x, y, 'A sign-in code is waiting in your email.', COLORS.muted, width)
    button(c, 'account-email-code', x, y + 1, 'Enter the code', 'Finish signing in with the code', focus)
  } else if (step.state === 'failed')
    wrapWords(step.message, width)
      .slice(0, 2)
      .forEach((line, i) => text(c, x, y + i, line, COLORS.statusError, width))
}

export function drawAccountSettings(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  focus: string
): boolean {
  const account = s.settingsGroup === 'account' ? shownAccount(s.workspace) : null
  if (!account) return false
  text(c, x, y, 'Account', COLORS.text, width, undefined, true)
  text(c, x, y + 2, accountLine(account), COLORS.text, width)
  if (account.signed_in) drawSignedIn(c, account, x, y + 3, width, focus)
  else drawSignedOut(c, s, account, x, y + 4, width, focus)
  return true
}
