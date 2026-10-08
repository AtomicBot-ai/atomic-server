import { AGENTS } from '../../agent-launch/index.js'
import { button, COLORS, text } from './canvas.js'
import type { Canvas } from './canvas.js'
import type { WorkspaceState } from './state.js'
import { serverEndpoint } from './actions.js'
import { fill } from './fortress.js'
export function drawServer(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  const api = s.base.daemon.kind === 'up' ? s.base.daemon.snapshot.server : undefined
  const wide = width >= 110,
    compact = bottom - y < 20,
    cardWidth = wide ? Math.floor(width * 0.63) : width
  fill(c, x, y, cardWidth, compact ? 7 : 9, '#201e24')
  text(
    c,
    x + 2,
    y + 1,
    api?.running ? 'YOUR SERVER IS ONLINE' : 'YOUR SERVER IS READY TO START',
    api?.running ? COLORS.green : COLORS.gold,
    cardWidth - 4,
    '#201e24'
  )
  text(c, x + 2, y + (compact ? 2 : 3), 'API endpoint', COLORS.muted, cardWidth - 4, '#201e24')
  text(c, x + 2, y + (compact ? 3 : 4), serverEndpoint(s), COLORS.text, cardWidth - 4, '#201e24')
  let ax = x + 2
  for (const [id, label, hint] of [
    [
      'api-toggle',
      api?.running ? 'Stop server' : 'Start server',
      api?.running
        ? 'Stop accepting new requests. Loaded models remain available.'
        : 'Launch your model API with key authentication.',
    ],
    ['copy-endpoint', 'Copy URL', 'Copy the OpenAI-compatible API endpoint.'],
    ['copy-key', 'Copy key', 'Copy your personal API key.'],
  ])
    ax += button(c, id!, ax, y + (compact ? 5 : 6), label!, hint!, focus, id === 'api-toggle') + 1
  const ky = wide ? y : y + (compact ? 7 : 10),
    kx = wide ? x + cardWidth + 3 : x
  text(c, kx, ky, 'CREDENTIALS', COLORS.gold)
  let bx = kx
  for (const [id, label, hint] of [
    ['page:keys', 'Manage API keys', 'Create, copy, reveal, and revoke client keys.'],
    ['examples', 'Connect an app', 'View a copyable request example.'],
  ])
    bx += button(c, id!, bx, ky + 2, label!, hint!, focus) + 1
  if (wide) {
    text(c, kx, ky + 4, 'Bearer token / OpenAI-compatible API', COLORS.muted, width - cardWidth - 3)
    text(
      c,
      kx,
      ky + 6,
      `${s.requests.length} requests / ${s.requests.filter((r) => Number(r.status) >= 400).length} errors`,
      COLORS.muted,
      width - cardWidth - 3
    )
  }
  const gy = wide ? y + 11 : y + 14
  if (gy + 2 < bottom) {
    text(c, x, gy, 'OPEN AN AGENT WITH THIS SERVER', COLORS.muted)
    let gx = x
    for (const a of AGENTS)
      gx +=
        button(
          c,
          `agent:${a.id}`,
          gx,
          gy + 2,
          `${a.name} >`,
          `Use Atomic Chat as the provider and switch to ${a.name}. Exit to return here.`,
          focus
        ) + 1
  } else {
    let gx = x
    for (const a of AGENTS)
      gx +=
        button(
          c,
          `agent:${a.id}`,
          gx,
          bottom - 2,
          a.name,
          `Launch ${a.name} with this server as its provider.`,
          focus
        ) + 1
  }
  let fx = x
  for (const [id, label, hint] of [
    ['test-request', 'Test in chat', 'Choose a model and send a real request.'],
    ['page:requests', 'Requests', 'Inspect recent requests.'],
    ['page:access', 'Connection', 'Edit bind address, port, and trusted hosts.'],
  ])
    fx += button(c, id!, fx, bottom, label!, hint!, focus) + 1
}
