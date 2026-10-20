/** Draws guided setup's steps for a managed engine or Foundry Local: models, review, download. */

import type { FoundryModelPlan, ManagedModelPlan } from '../../../contract/index.js'
import type { SetupView } from '../../../terminal-setup/index.js'
import { formatSize, foundryVerdictText, variantLabel, verdictLine } from '../../../workspace-view/index.js'
import { computeRowWindow } from '../../row-window.js'
import { button, COLORS, text, wrap } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { pathJob } from './engine-setup.js'

type Area = { x: number; y: number; width: number; bottom: number; focus: string }

export function drawPathModels(c: Canvas, s: WorkspaceState, v: SetupView, a: Area) {
  const path = v.path!
  text(
    c,
    a.x,
    a.y + 3,
    v.query ? `Results for “${v.query}”` : `Models for ${path.engine}`,
    COLORS.gold,
    a.width
  )
  text(
    c,
    a.x,
    a.y + 4,
    path.kind === 'managed'
      ? 'Checkpoints the engine’s release was measured with; Search looks further on Hugging Face.'
      : 'Atomic Chat’s list, then Microsoft’s catalog; the variant for this machine is chosen for you.',
    COLORS.muted,
    a.width
  )
  const win = computeRowWindow(path.rows.length, s.selected, Math.max(1, a.bottom - a.y - 8))
  path.rows
    .slice(win.start, win.start + win.count)
    .forEach((r, i) =>
      button(
        c,
        `setup-path-repo:${win.start + i}`,
        a.x,
        a.y + 6 + i,
        `${r.title}  ${r.detail}`.slice(0, a.width - 2),
        'Review this model',
        a.focus
      )
    )
  if (!path.rows.length)
    text(c, a.x, a.y + 6, v.busy ? 'Reading models…' : 'No models found.', COLORS.muted, a.width)
  if (v.error) text(c, a.x, a.bottom - 1, v.error, COLORS.red, a.width)
  button(c, 'setup-engine-back', a.x, a.bottom, '< Engine', 'Change inference engine.', a.focus)
  button(c, 'setup-query', a.x + 13, a.bottom, 'Search', 'Search more models.', a.focus)
}

function planLinesOf(plan: ManagedModelPlan | FoundryModelPlan): string[] {
  if ('variant_id' in plan)
    return [
      `${plan.name}: ${plan.variant_id} (${variantLabel(plan)})`,
      `Verdict: ${foundryVerdictText(plan.verdict)}`,
      `${plan.pending.length} of ${plan.files.length} files, ${formatSize(plan.download_bytes)}`,
      ...(plan.unverified ? ['A Microsoft catalog model: unverified by Atomic Chat.'] : []),
    ]
  return [
    `${plan.repository} @ ${plan.revision.slice(0, 12)}`,
    verdictLine(plan.verdict),
    `${plan.pending.length} of ${plan.files.length} files, ${formatSize(plan.download_bytes)}, into ${plan.root}`,
  ]
}

export function drawPathReview(c: Canvas, v: SetupView, a: Area) {
  const plan = v.path?.plan
  if (!plan) return
  text(c, a.x, a.y + 3, 'Review before downloading', COLORS.gold, a.width)
  const lines = [...planLinesOf(plan), ...plan.blockers].flatMap((l) => wrap(l, a.width))
  lines
    .slice(0, Math.max(1, a.bottom - a.y - 6))
    .forEach((l, i) => text(c, a.x, a.y + 5 + i, l, COLORS.text, a.width))
  if (v.error) text(c, a.x, a.bottom - 1, v.error, COLORS.red, a.width)
  if (!plan.blockers.length)
    button(c, 'setup-path-install', a.x, a.bottom, 'Download', 'Download in the server', a.focus)
  button(c, 'setup-back', a.x + 13, a.bottom, 'Back', 'Return without downloading', a.focus)
}

export function drawPathDownload(c: Canvas, s: WorkspaceState, v: SetupView, a: Area) {
  const job = v.path?.job
  const state = pathJob(v, s.workspace)
  text(c, a.x, a.y + 3, 'DOWNLOADING YOUR MODEL.', COLORS.gold, a.width)
  text(
    c,
    a.x,
    a.y + 4,
    'It runs in the server: close this terminal and come back later if you like.',
    COLORS.muted,
    a.width
  )
  text(c, a.x, a.y + 6, `${job?.model ?? ''} for ${job?.engine ?? ''}`, COLORS.text, a.width)
  const total = state?.total ?? 0,
    done = state?.done ?? 0
  const bw = Math.min(30, Math.max(10, a.width - 30)),
    filled = total ? Math.round((bw * done) / total) : state?.stage === 'ready' ? bw : 0
  text(
    c,
    a.x,
    a.y + 7,
    `[${'#'.repeat(filled)}${'.'.repeat(bw - filled)}] ${total ? `${formatSize(done)} / ${formatSize(total)}` : ''}  ${state?.stage ?? 'queued'}`,
    COLORS.gold,
    a.width
  )
  if (state?.error) text(c, a.x, a.y + 9, state.error, COLORS.red, a.width)
  if (v.error) text(c, a.x, a.bottom - 1, v.error, COLORS.red, a.width)
}
