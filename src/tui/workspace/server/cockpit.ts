import type { EyeStatus } from '../draw/art.js'
import { button, COLORS, text } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { fill } from '../draw/fortress.js'
import { loadStageText, operationView } from '../../../workspace-view/index.js'

export function cockpitStatus(s: WorkspaceState): EyeStatus {
  if (/stopping/i.test(s.message) && s.busy) return 'stopping'
  if ((s.busy && /Starting|Restarting|Loading/i.test(s.message)) || s.base.busy) return 'starting'
  if (s.workspace) return s.workspace.eye
  if (s.base.daemon.kind === 'down') return s.base.daemon.error ? 'error' : 'offline'
  if (s.base.daemon.kind !== 'up' || !s.base.daemon.snapshot.server.running) return 'offline'
  return s.generating ? 'busy' : 'ready'
}
/**
 * The privileged steps the server waits on, with the command to run as administrator, and the managed
 * engine operations in progress — from the snapshot; before the first one, the steps the daemon reported.
 */
export function cockpitNotices(
  s: WorkspaceState
): Array<{ text: string; command: boolean; id?: string; hint?: string }> {
  const steps = s.workspace?.host_steps ?? (s.base.daemon.kind === 'up' ? s.base.daemon.pending : [])
  return [
    ...steps.flatMap((step) => [
      { text: 'Waiting for a privileged step; run as administrator:', command: false },
      { text: step.instructions, command: true },
    ]),
    ...(s.workspace?.engines ?? []).flatMap((e) =>
      e.operation ? [{ text: operationView(e.operation).text, command: false }] : []
    ),
    ...(s.workspace?.loads ?? []).map((l) => ({
      text: `${l.provider}  ${l.model_id}  · ${loadStageText({ ...l, elapsed_ms: l.elapsed_ms + Math.max(0, Date.now() - l.at) })}`,
      command: false,
    })),
    // This terminal's failed load: the core keeps no failure, so only the client that loaded knows it.
    ...(s.loadError
      ? [
          {
            text: `Load failed: ${s.loadError.model} on ${s.loadError.provider}: ${s.loadError.message}`,
            command: false,
            id: 'load-log',
            hint: 'View the last attempt’s log',
          },
        ]
      : []),
  ]
}
const metric = (value: number | null | undefined, unit: string) =>
  value == null ? '—' : `${value.toFixed(value < 10 ? 1 : 0)}${unit}`

export function drawCockpit(c: Canvas, s: WorkspaceState, height: number, _seconds: number, focus: string) {
  const state = cockpitStatus(s),
    narrow = c.width < 95
  const x = 2,
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
  text(c, c.width - label.length - 2, 1, label, COLORS.gold, label.length)
  const rows =
    s.workspace?.services ??
    (s.base.daemon.kind === 'up'
      ? s.base.daemon.snapshot.sessions.map((v) => ({
          provider: v.provider,
          model: v.model_id,
          state: 'loaded',
        }))
      : [])
  // What needs a person comes first: a privileged step to run by hand, then engine work in progress.
  const notices = cockpitNotices(s)
  notices
    .slice(0, Math.max(1, height - 4))
    .forEach((n, i) =>
      n.id
        ? button(c, n.id, x, i + 1, n.text.slice(0, Math.max(0, width - 2)), n.hint ?? '', focus)
        : text(c, x, i + 1, n.text, n.command ? COLORS.green : COLORS.text, width)
    )
  const top = 1 + Math.min(notices.length, Math.max(1, height - 4))
  rows
    .slice(0, Math.max(0, height - 3 - top))
    .forEach((v, i) => text(c, x, top + i, `${v.provider}  ${v.model}  · ${v.state}`, COLORS.gold, width))
  if (!rows.length && top < height - 2) text(c, x, top, 'No model loaded', COLORS.muted, width)
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
