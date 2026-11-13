/** Remote access in two lines per card, under the account's devices on a screen too short for the cards. */
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { button, COLORS, text, textWidth } from '../draw/canvas.js'
import { actionButton } from '../draw/cards.js'
import { remoteSetupView } from '../../../workspace-view/index.js'

/** A title with its status after it. */
function heading(c: Canvas, x: number, y: number, width: number, title: string, status: string) {
  text(c, x, y, title, COLORS.text, width, undefined, true)
  text(c, x + textWidth(title) + 1, y, `· ${status}`, COLORS.muted, width - textWidth(title) - 1)
}

export function drawRemoteCompact(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  const found = remoteSetupView(s.remote)
  const setup = found?.found ? null : found
  heading(
    c,
    x,
    y,
    width,
    'Public remote access',
    `Cloudflare · ${found?.status ?? s.remote['state'] ?? 'Checking status'}`
  )
  if (setup) {
    const at =
      x +
      button(
        c,
        'remote-setup-copy',
        x,
        y + 1,
        'Copy commands',
        'Copy the install commands and the restart',
        focus
      )
    text(c, at + 1, y + 1, setup.intro, COLORS.muted, x + width - at - 1)
  } else if (s.busy) text(c, x + 1, y + 1, 'Updating…', COLORS.muted, width)
  else {
    const at =
      x +
      actionButton(
        c,
        'remote-toggle',
        x,
        y + 1,
        s.remote['canStop'] ? 'Stop access' : 'Start access',
        'Start or stop the public tunnel',
        focus
      )
    if (s.remote['url'])
      button(c, 'remote-copy', at + 1, y + 1, 'Copy URL', 'Copy the public endpoint', focus)
  }
  const lan = s.workspace?.api.running && s.workspace.api.host === '0.0.0.0'
  heading(c, x, y + 3, width, 'Local network', lan ? 'Available on your network' : 'This device only')
  if (s.busy) text(c, x + 1, y + 4, 'Updating…', COLORS.muted, width)
  else {
    const at =
      x +
      actionButton(
        c,
        'lan-toggle',
        x,
        y + 4,
        lan ? 'Stop access' : 'Start access',
        'Change network access; active requests are interrupted',
        focus
      )
    const addresses = s.remote['addresses']
    if (lan && Array.isArray(addresses))
      text(
        c,
        at + 1,
        y + 4,
        addresses.map((a) => `http://${a}:${s.workspace?.api.port}`).join(' · '),
        COLORS.muted,
        x + width - at - 1
      )
  }
  const error = found?.found ? found.intro : setup ? '' : s.remote['error']
  if (error) text(c, x, bottom - 1, String(error), COLORS.statusError, width)
  button(c, 'remote-refresh', x, bottom, 'Refresh status', 'Refresh remote access status', focus)
}
