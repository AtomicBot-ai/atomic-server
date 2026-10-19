import { button, COLORS, text, wrap } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { eyeArtwork, drawRider } from '../draw/fortress.js'
import type { WorkspaceState } from '../state.js'
import { computeRowWindow } from '../../row-window.js'
import { drawSetupBrowser } from './setup-browser.js'
import { drawSetupReview } from './setup-review.js'
export function bytes(n: number): string {
  if (!n) return 'size unknown'
  return n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(2)} GB`
    : n >= 1024 ** 2
      ? `${(n / 1024 ** 2).toFixed(1)} MB`
      : `${Math.max(1, Math.round(n / 1024))} KB`
}
export function drawSetup(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string,
  seconds: number
) {
  const v = s.setup
  if (!v) return
  let contentBottom = bottom
  const put = (dy: number, value: string, color: string = COLORS.text) => {
    if (y + dy < contentBottom) text(c, x, y + dy, value, color, width)
  }
  const b = (id: string, dy: number, label: string, hint: string, selected = false) =>
    button(c, id, x, y + dy, label.slice(0, width - 2), hint, focus, selected)
  put(
    0,
    s.setupComplete
      ? v.stage === 'engine'
        ? 'Inference engines'
        : v.stage === 'models'
          ? 'Discover models'
          : 'Downloads'
      : `SET UP YOUR ${v.mode === 'server' ? 'SERVER' : 'PERSONAL TERMINAL'}`,
    COLORS.gold
  )
  const active = v.stage === 'engine' ? 0 : v.stage === 'models' ? 1 : v.stage === 'ready' ? 3 : 2
  let stepX = x
  for (const [i, label] of (s.setupComplete
    ? []
    : ['01 Engine', '02 Models', '03 Install', '04 Ready']
  ).entries()) {
    text(
      c,
      stepX,
      y + 1,
      label,
      i === active ? COLORS.gold : COLORS.muted,
      width - (stepX - x),
      undefined,
      i === active
    )
    stepX += label.length
    if (i < 3) {
      text(c, stepX, y + 1, ' / ', COLORS.stone, 3)
      stepX += 3
    }
  }
  if (s.setupComplete)
    button(
      c,
      'library-close',
      x,
      y + 1,
      '‹ Your library',
      'Return to your model library | Downloads continue in background',
      focus
    )
  if (v.stage === 'review') {
    drawSetupReview(c, v, x, y, width, bottom, focus)
  } else if (v.stage === 'engine' || v.stage === 'models') {
    drawSetupBrowser(c, s, x, y, width, bottom, focus)
  } else {
    contentBottom = bottom - (s.motion ? (c.height >= 40 ? 6 : 3) : 1)
    const progress = v.progress,
      ready = progress?.ready
    const roomy = bottom - y >= 26
    let row = 3
    if (roomy) {
      const h = Math.min(16, bottom - y - 20),
        w = Math.min(width - 4, h * 4 + 20, 92)
      eyeArtwork(c, x + Math.floor((width - w) / 2), y + row, w, h, seconds, s.motion)
      row += h + 1
    }
    put(
      row++,
      ready
        ? v.error
          ? 'MODEL NEEDS ATTENTION.'
          : 'STARTING YOUR MODEL.'
        : s.setupComplete
          ? 'DOWNLOADING YOUR MODEL.'
          : 'BUILDING YOUR LOCAL WORKSPACE.',
      COLORS.gold
    )
    put(
      row++,
      ready
        ? 'Download verified. Loading the model into memory...'
        : v.preparing
          ? 'Checking model requirements before downloading.'
          : progress?.restart
            ? 'An earlier version started this installation. Retry starts it again; downloaded files are reused.'
            : 'Leave this terminal open, or close it and return later. Downloads continue.',
      COLORS.muted
    )
    row++
    if (!ready) {
      const eta = progress?.eta
      put(
        row++,
        progress?.speed
          ? `${bytes(progress.speed)}/s  /  about ${eta != null && eta >= 60 ? Math.ceil(eta / 60) + ' min' : (eta ?? '--') + ' sec'} of model transfers left`
          : v.preparing
            ? 'Resolving model files and compatibility...'
            : 'Measuring download speed... estimates appear as data arrives.',
        COLORS.muted
      )
    }
    put(
      row++,
      `${progress?.engineReady ? '[ready]' : '[ ... ]'} Engine  ${v.engine.split('|').slice(1).join(' / ')}`
    )
    if (v.preparing) {
      put(row++, v.pending?.repo ?? v.repository, COLORS.text)
      put(row++, v.pending?.file ?? 'Finding the recommended GGUF download...', COLORS.muted)
      const track = Array.from({ length: Math.min(30, width - 4) }, (_, i) =>
        Math.abs(i - (Math.floor(seconds * 4) % Math.min(30, width - 4))) < 2 ? '=' : '.'
      ).join('')
      put(row++, `[${track}] Preparing`, COLORS.gold)
      put(row++, 'Esc Cancel | Return to model selection', COLORS.stone)
    }
    const jobsWindow = computeRowWindow(
      v.selections.length,
      s.selected,
      Math.max(1, Math.floor((contentBottom - y - row - 2) / (c.height >= 32 ? 3 : 2)))
    )
    for (const [i, selection] of v.selections
      .slice(jobsWindow.start, jobsWindow.start + jobsWindow.count)
      .entries()) {
      const job = progress?.jobs.find((j) => j.request_id === selection.requestId)
      const transfer = progress?.transfers.find((t) => t.taskId === job?.task_ids.model)
      const percent = job?.stage === 'ready' ? 100 : (transfer?.percent ?? 0)
      const bw = Math.min(30, Math.max(10, width - 38)),
        done = Math.round((bw * percent) / 100)
      b(
        `setup-job:${jobsWindow.start + i}`,
        row++,
        `${job?.stage === 'ready' ? '[ready]' : '[ ... ]'} ${selection.plan.model_id}`,
        'View this download. Up/Down scrolls the installation list.'
      )
      put(
        row++,
        `[${'#'.repeat(done)}${'.'.repeat(bw - done)}] ${percent.toFixed(0)}%  ${job?.stage === 'ready' ? bytes(selection.plan.model.size) : transfer ? bytes(transfer.transferred) : 'Waiting'} / ${bytes(selection.plan.model.size)}`,
        COLORS.gold
      )
      if (c.height >= 32)
        put(
          row++,
          (job?.error?.message ?? job?.stage ?? 'queued').replaceAll('_', ' '),
          job?.error ? COLORS.red : COLORS.muted
        )
    }
    const elapsed = v.startedAt ? (Date.now() - v.startedAt) / 1000 : seconds
    if (!ready) {
      put(row++, 'Parallel transfers  /  Resumable files  /  SHA-256 verification', COLORS.muted)
      if (y + row < contentBottom - 1) {
        const tips = [
          'Atomic Agent can use this server as its local model provider.',
          'Create a separate API key for each app; revoke access without stopping your server.',
          'Ctrl+P brings back recent conversations, including their model and context.',
          'Mouse or keyboard: every visible action works both ways. Ctrl+K shows shortcuts.',
        ]
        wrap(tips[Math.floor(elapsed / 16) % tips.length]!, width)
          .slice(0, 2)
          .forEach((line) => put(row++, line, COLORS.stone))
      }
      const rh = c.height >= 40 ? 6 : 3
      drawRider(c, bottom - rh, elapsed, s.motion, rh === 3)
    }
    if (ready)
      button(
        c,
        'setup-finish',
        x,
        bottom,
        v.busy ? 'Loading model...' : 'Retry model load',
        'Load the selected model, then open the workspace.',
        focus
      )
    else if (v.preparing) {
      button(c, 'setup-cancel', x, bottom, '< Cancel', 'Cancel preparation and return to models. Esc', focus)
      if (v.error)
        button(c, 'setup-retry', x + 13, bottom, 'Retry', 'Retry this model’s compatibility check.', focus)
    } else {
      button(
        c,
        'setup-retry',
        x,
        bottom,
        'Resume / retry',
        'Resume interrupted downloads. Existing files are kept.',
        focus
      )
      button(
        c,
        'setup-pause',
        x + 19,
        bottom,
        'Pause',
        'Pause downloads and retain partial files. Esc',
        focus
      )
      if (v.error && !progress)
        button(c, 'setup-cancel', x + 29, bottom, 'Back', 'Return to model selection.', focus)
    }
  }
  const error = v.error || v.progress?.error
  if (error) text(c, x, bottom - 1, error, COLORS.red, width)
  else if (v.busy)
    text(
      c,
      x,
      bottom - 1,
      v.preparing ? 'Checking model... | Esc Cancel' : 'Working... | Tab Navigate | Ctrl+Q Close',
      COLORS.stone,
      width
    )
}
