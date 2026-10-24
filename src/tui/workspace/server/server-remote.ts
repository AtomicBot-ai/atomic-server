import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { button, COLORS, text } from '../draw/canvas.js'
import { panel, actionButton } from '../draw/cards.js'
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
  const lan = s.workspace?.api.running && s.workspace.api.host === '0.0.0.0'
  for (const [local, top] of [
    [false, y],
    [true, y + cardHeight + 1],
  ] as const) {
    panel(c, x, top, width, cardHeight)
    text(
      c,
      x + 2,
      top + 1,
      local ? 'Local network' : 'Public remote access',
      COLORS.text,
      width - 4,
      undefined,
      true
    )
    text(
      c,
      x + 2,
      top + 2,
      local
        ? lan
          ? 'Available on your network'
          : 'This device only'
        : `Cloudflare · ${s.remote['state'] ?? 'Checking status'}`,
      COLORS.muted,
      width - 4
    )
    if (!s.busy)
      actionButton(
        c,
        local ? 'lan-toggle' : 'remote-toggle',
        x + 2,
        top + 3,
        (local ? lan : s.remote['canStop']) ? 'Stop access' : 'Start access',
        local ? 'Change network access; active requests are interrupted' : 'Start or stop the public tunnel',
        focus
      )
    else text(c, x + 3, top + 4, 'Updating…', COLORS.muted, width - 6)
    if (cardHeight > 7) {
      if (!local && s.remote['url'])
        button(c, 'remote-copy', x + 1, top + 6, 'Copy URL', 'Copy the public endpoint', focus)
      const addresses = s.remote['addresses']
      if (local && lan && Array.isArray(addresses))
        text(
          c,
          x + 2,
          top + 6,
          addresses.map((a) => `http://${a}:${s.workspace?.api.port}`).join(' · '),
          COLORS.muted,
          width - 4
        )
    }
  }
  if (s.remote['error']) text(c, x, bottom - 1, String(s.remote['error']), COLORS.red, width)
  button(c, 'remote-refresh', x, bottom, 'Refresh status', 'Refresh remote access status', focus)
}
