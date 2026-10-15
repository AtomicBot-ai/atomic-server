import { drawEye } from '../draw/art.js'
import type { EyeStatus } from '../draw/art.js'
import { art, button, COLORS, text } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { fill } from '../draw/fortress.js'

export function cockpitStatus(s: WorkspaceState): EyeStatus {
  if (/stopping/i.test(s.message) && s.busy) return 'stopping'
  if ((s.busy && /Starting|Restarting|Loading/i.test(s.message)) || s.base.busy) return 'starting'
  if (s.workspace) return s.workspace.eye
  if (s.base.daemon.kind === 'down') return s.base.daemon.error ? 'error' : 'offline'
  if (s.base.daemon.kind !== 'up' || !s.base.daemon.snapshot.server.running) return 'offline'
  return s.generating ? 'busy' : 'ready'
}
const metric = (value: number | null | undefined, unit: string) =>
  value == null ? '—' : `${value.toFixed(value < 10 ? 1 : 0)}${unit}`

export function drawCockpit(c: Canvas, s: WorkspaceState, height: number, seconds: number, focus: string) {
  const state = cockpitStatus(s),
    narrow = c.width < 95
  const eyeWidth = Math.min(narrow ? 18 : 27, Math.round((height - 1) * 2.75))
  art(c, 1, 0, drawEye(eyeWidth, height - 1, seconds, s.motion, state))
  const x = eyeWidth + 3,
    width = c.width - x - 2
  const label = {
    offline: 'Offline',
    starting: 'Starting',
    ready: 'Online',
    busy: 'Serving',
    overloaded: 'Overloaded',
    error: 'Needs attention',
    stopping: 'Stopping',
  }[state]
  text(c, x, 0, `ATOMIC CHAT   ${label}`, COLORS.text, width, undefined, true)
  const rows =
    s.workspace?.services ??
    (s.base.daemon.kind === 'up'
      ? s.base.daemon.snapshot.sessions.map((v) => ({
          provider: v.provider,
          model: v.model_id,
          state: 'loaded',
        }))
      : [])
  rows
    .slice(0, Math.max(1, height - 4))
    .forEach((v, i) => text(c, x, i + 1, `${v.provider}  ${v.model}  · ${v.state}`, COLORS.gold, width))
  if (!rows.length) text(c, x, 1, 'No model loaded', COLORS.muted, width)
  if (rows.length > height - 4)
    text(
      c,
      x,
      height - 3,
      `+${rows.length - Math.max(1, height - 4)} services · Engines & Models`,
      COLORS.muted,
      width
    )
  const m = s.workspace?.metrics
  text(
    c,
    x,
    height - 2,
    `${m?.requests ?? s.requests.length} requests / 5m  ${m?.errors ?? 0} errors  ${metric(m?.tokens_per_second, ' tok/s')}${narrow ? '' : `  ${metric(m?.mean_ttft_ms, ' ms')} first token`}`,
    COLORS.muted,
    width
  )
  c.targets.push({
    id: 'metrics',
    x,
    y: height - 2,
    width,
    height: 1,
    hint: m?.detailed
      ? 'Detailed timings enabled | Click to configure'
      : 'Enable detailed timing and TPS | Core captures request/reply previews',
  })
  let bx = 2
  const running =
    s.workspace?.api.running ?? (s.base.daemon.kind === 'up' && s.base.daemon.snapshot.server.running)
  for (const [id, label, hint] of [
    [
      'api-toggle',
      running ? 'Stop' : 'Start',
      running ? 'Stop API | Active requests are interrupted' : 'Start API',
    ],
    ['api-restart', 'Restart', 'Restart listener | Active requests are interrupted'],
    ['api-ping', 'Ping', 'Test authenticated model endpoint'],
    ['page:models', 'Models', 'Load, unload and configure engines and models'],
    ['open-admin', narrow ? 'Web' : 'Web admin', 'Open authenticated web admin'],
  ]) {
    if (bx + label!.length + 2 > c.width - 1) break
    bx += button(c, id!, bx, height, label!, hint!, focus) + 1
  }
  fill(c, 0, height + 1, c.width, 1, COLORS.ground)
}
