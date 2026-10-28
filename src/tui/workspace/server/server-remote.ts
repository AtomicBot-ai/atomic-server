import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { button, COLORS, text, wrap, wrapWords } from '../draw/canvas.js'
import { panel, actionButton } from '../draw/cards.js'
import { remoteSetupView } from '../../../workspace-view/index.js'
import type { RemoteSetupView } from '../../../workspace-view/index.js'
export function drawServerRemote(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  const cardHeight = Math.min(8, Math.floor((bottom - y) / 2))
  const found = remoteSetupView(s.remote)
  // A program that is there and would not start keeps the usual card: Start tries it again.
  const setup = found?.found ? null : found
  const body = setup ? setupLines(setup, width - 4) : []
  // The steps take the room they need, down to what leaves the local card its usual height.
  const publicHeight = setup
    ? Math.max(5, Math.min(5 + body.length, bottom - y - cardHeight - 1))
    : cardHeight
  panel(c, x, y, width, publicHeight)
  text(c, x + 2, y + 1, 'Public remote access', COLORS.text, width - 4, undefined, true)
  text(
    c,
    x + 2,
    y + 2,
    `Cloudflare · ${found?.status ?? s.remote['state'] ?? 'Checking status'}`,
    COLORS.muted,
    width - 4
  )
  if (setup) {
    button(
      c,
      'remote-setup-copy',
      x + 1,
      y + 3,
      'Copy commands',
      'Copy the install commands and the restart',
      focus
    )
    body
      .slice(0, publicHeight - 5)
      .forEach((line, i) => text(c, x + 2, y + 4 + i, line.text, line.color, width - 4))
  } else drawPublicActions(c, s, x, y, width, cardHeight, focus)
  drawLocal(c, s, x, y + publicHeight + 1, width, cardHeight, focus)
  if (found?.found) {
    const lines = wrapWords(found.intro, width)
    const top = Math.max(y + publicHeight + cardHeight + 1, bottom - lines.length)
    lines.slice(0, bottom - top).forEach((line, i) => text(c, x, top + i, line, COLORS.statusError, width))
  } else if (s.remote['error'] && !setup)
    text(c, x, bottom - 1, String(s.remote['error']), COLORS.statusError, width)
  button(c, 'remote-refresh', x, bottom, 'Refresh status', 'Refresh remote access status', focus)
}

/** The install steps as rows: what to do, each command after a `$`, then the restart. */
function setupLines(setup: RemoteSetupView, width: number) {
  const rows = (lines: string[], color: string) => lines.map((line) => ({ text: line, color }))
  return [
    ...rows(wrapWords(setup.intro, width), COLORS.muted),
    ...rows(setup.commands.length || setup.found ? [] : [setup.url], COLORS.text),
    ...setup.commands.flatMap((command) => rows(wrap(`$ ${command}`, width), COLORS.text)),
    ...rows(setup.restart ? wrapWords(`Then restart the server: ${setup.restart}`, width) : [], COLORS.muted),
  ]
}

function drawPublicActions(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  top: number,
  width: number,
  height: number,
  focus: string
) {
  if (!s.busy)
    actionButton(
      c,
      'remote-toggle',
      x + 2,
      top + 3,
      s.remote['canStop'] ? 'Stop access' : 'Start access',
      'Start or stop the public tunnel',
      focus
    )
  else text(c, x + 3, top + 4, 'Updating…', COLORS.muted, width - 6)
  if (height > 7 && s.remote['url'])
    button(c, 'remote-copy', x + 1, top + 6, 'Copy URL', 'Copy the public endpoint', focus)
}

function drawLocal(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  top: number,
  width: number,
  height: number,
  focus: string
) {
  const lan = s.workspace?.api.running && s.workspace.api.host === '0.0.0.0'
  panel(c, x, top, width, height)
  text(c, x + 2, top + 1, 'Local network', COLORS.text, width - 4, undefined, true)
  text(c, x + 2, top + 2, lan ? 'Available on your network' : 'This device only', COLORS.muted, width - 4)
  if (!s.busy)
    actionButton(
      c,
      'lan-toggle',
      x + 2,
      top + 3,
      lan ? 'Stop access' : 'Start access',
      'Change network access; active requests are interrupted',
      focus
    )
  else text(c, x + 3, top + 4, 'Updating…', COLORS.muted, width - 6)
  const addresses = s.remote['addresses']
  if (height > 7 && lan && Array.isArray(addresses))
    text(
      c,
      x + 2,
      top + 6,
      addresses.map((a) => `http://${a}:${s.workspace?.api.port}`).join(' · '),
      COLORS.muted,
      width - 4
    )
}
