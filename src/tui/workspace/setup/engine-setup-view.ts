/** Draws guided setup's steps for a managed engine or Foundry Local: models, review, download. */

import type { FoundryModelPlan, ManagedModelPlan } from '../../../contract/index.js'
import type { SetupView } from '../../../terminal-setup/index.js'
import { formatSize, foundryVerdictText, variantLabel } from '../../../workspace-view/index.js'
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
  return [plan.repository, `Download: ${formatSize(plan.download_bytes)}`]
}

/** A Foundry variant that runs once Foundry Local is ready: the step its panel takes. */
const FOUNDRY_STEP: Record<string, string> = {
  'accelerator-not-prepared': 'Prepare accelerators',
  'engine-not-installed': 'Install Foundry Local',
}

export function drawPathReview(c: Canvas, v: SetupView, a: Area) {
  const plan = v.path?.plan
  if (!plan) return
  text(c, a.x, a.y + 3, 'Download', COLORS.gold, a.width)
  const lines = [...planLinesOf(plan), ...plan.blockers].flatMap((l) => wrap(l, a.width))
  lines
    .slice(0, Math.max(1, a.bottom - a.y - 6))
    .forEach((l, i) => text(c, a.x, a.y + 5 + i, l, COLORS.text, a.width))
  if (v.error) text(c, a.x, a.bottom - 1, v.error, COLORS.red, a.width)
  const waits = 'variant_id' in plan ? FOUNDRY_STEP[plan.verdict.verdict] : undefined
  let bx = a.x
  if (!plan.blockers.length)
    bx += button(c, 'setup-path-install', bx, a.bottom, 'Download', 'Download in the server', a.focus) + 1
  else if (waits)
    bx += button(c, 'setup-path-foundry', bx, a.bottom, waits, 'Open Foundry Local', a.focus) + 1
  button(c, 'setup-back', bx, a.bottom, 'Back', 'Return without downloading', a.focus)
}

export function drawPathDownload(c: Canvas, s: WorkspaceState, v: SetupView, a: Area) {
  const job = v.path?.job
  const state = pathJob(v, s.workspace)
  text(c, a.x, a.y + 3, 'Downloading', COLORS.gold, a.width)
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
  let bx = a.x
  if (state && STOPPED.includes(state.stage))
    bx +=
      button(
        c,
        'setup-path-resume',
        bx,
        a.bottom,
        'Resume',
        'Continue this download in the server',
        a.focus
      ) + 1
  if (state?.stage === 'ready' && v.error)
    bx += button(c, 'setup-path-finish', bx, a.bottom, 'Retry', 'Load the model again', a.focus) + 1
  button(
    c,
    'setup-path-abandon',
    bx,
    a.bottom,
    'Choose another model',
    'Leave this download and pick again',
    a.focus
  )
}

const STOPPED = ['failed', 'cancelled', 'interrupted']
