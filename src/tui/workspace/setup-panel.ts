import { button, COLORS, text, wrap } from './canvas.js'
import type { Canvas } from './canvas.js'
import { towerEye, drawRider } from './fortress.js'
import type { WorkspaceState } from './state.js'
import { computeRowWindow } from '../row-window.js'
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
  put(0, `SET UP YOUR ${v.mode === 'server' ? 'SERVER' : 'PERSONAL TERMINAL'}`, COLORS.gold)
  put(1, `01 Engine  /  02 Models  /  03 Install  /  04 Ready`, COLORS.muted)
  if (v.stage === 'engine') {
    put(3, 'An engine tuned for this machine.', COLORS.text)
    put(
      4,
      v.busy
        ? 'Checking hardware and available builds...'
        : 'Recommended builds come from the live engine catalog.',
      COLORS.muted
    )
    let row = 6
    for (const catalog of v.catalogs) {
      if (y + row >= bottom - 3) break
      put(
        row++,
        catalog.provider === 'llamacpp-upstream'
          ? 'llama.cpp  /  Standard GGUF models'
          : 'Atomic Prism  /  Bonsai models',
        COLORS.gold
      )
      const recommended = catalog.available.find((p) => `${p.version}/${p.backend}` === catalog.recommended)
      const options = [recommended, ...catalog.available]
        .filter(
          (p, i, all) => p && all.findIndex((a) => a?.version === p.version && a?.backend === p.backend) === i
        )
        .slice(0, c.height < 30 ? 1 : 3)
      for (const build of options) {
        if (!build || y + row >= bottom - 2) break
        const value = `${catalog.provider}|${build.version}|${build.backend}`
        b(
          `setup-engine:${value}`,
          row++,
          `${v.engine === value ? '(o)' : '( )'} ${build.backend} / ${build.version}${build === recommended ? '  Recommended' : ''}`,
          'Select this compatible engine. Tab or arrows to move; Enter selects.',
          v.engine === value
        )
      }
      row++
    }
    button(c, 'setup-refresh', x, bottom, 'Retry detection', 'Refresh the live engine catalog.', focus)
    if (v.engine)
      button(c, 'setup-models', x + 19, bottom, 'Choose models >', 'Continue to model selection.', focus)
  } else if (v.stage === 'models') {
    b('setup-query', 3, `Search: ${v.query}`, 'Search the live Hugging Face GGUF catalog. Enter edits.')
    put(4, v.repository || 'Popular matching repositories. Select one to see its files.', COLORS.muted)
    const items = v.repository ? v.files : v.repositories
    const win = computeRowWindow(items.length, s.selected, Math.max(1, bottom - y - 8))
    items.slice(win.start, win.start + win.count).forEach((item, i) => {
      const index = win.start + i
      if ('filename' in item) {
        const selected = v.selections.some(
          (p) => p.request.repo === v.repository && p.request.file === item.filename
        )
        b(
          `setup-file:${index}`,
          6 + i,
          `${selected ? '[x]' : '[ ]'} ${item.filename}  ${bytes(item.size)}`,
          'Toggle this model. Includes its required vision projector. Space or Enter.',
          selected
        )
      } else
        b(`setup-repo:${index}`, 6 + i, item.id, 'Read this repository’s actual model files. Enter opens.')
    })
    put(
      bottom - y - 1,
      `${v.selections.length} selected  /  ${bytes(v.selections.reduce((sum, p) => sum + p.plan.total_download_bytes, 0))}`,
      COLORS.gold
    )
    let bx = x
    for (const [id, label, hint] of [
      ['setup-engine-back', '< Engine', 'Return to engine selection.'],
      ['setup-back', 'Repositories', 'Keep your selections and browse more repositories.'],
      ['setup-review', 'Review >', 'Review all selected downloads before starting.'],
    ])
      bx += button(c, id!, bx, bottom, label!, hint!, focus) + 1
  } else if (v.stage === 'review') {
    put(3, 'Ready to prepare your workspace.', COLORS.text)
    put(5, `Engine  ${v.engine.split('|').slice(1).join(' / ')}`, COLORS.muted)
    let row = 7
    v.selections.forEach((selection) => {
      put(row++, `${selection.plan.model_id}  /  ${bytes(selection.plan.total_download_bytes)}`)
      if (selection.plan.projector) put(row++, '  Includes vision projector', COLORS.muted)
    })
    put(
      row + 1,
      `Model downloads: ${bytes(v.selections.reduce((sum, p) => sum + p.plan.total_download_bytes, 0))}`,
      COLORS.gold
    )
    put(row + 2, 'The engine download is additional. Free space is checked before transfer.', COLORS.muted)
    put(row + 4, 'Downloads run in the background and resume after interruption.', COLORS.muted)
    button(c, 'setup-back', x, bottom, '< Models', 'Change the selected models.', focus)
    button(
      c,
      'setup-begin',
      x + 13,
      bottom,
      'Download and install',
      'Start real engine and model downloads. The workspace opens after verification.',
      focus
    )
  } else {
    contentBottom = bottom - (s.motion ? (c.height >= 40 ? 6 : 3) : 1)
    const progress = v.progress,
      ready = progress?.ready
    const roomy = bottom - y >= 26
    let row = 3
    if (roomy) {
      const h = Math.min(12, bottom - y - 20),
        w = Math.min(width - 4, h * 6 + 20)
      towerEye(c, x + Math.floor((width - w) / 2), y + row, w, h, seconds, s.motion)
      row += h + 1
    }
    put(row++, ready ? 'THE GATES ARE READY.' : 'BUILDING YOUR LOCAL WORKSPACE.', COLORS.gold)
    put(
      row++,
      ready
        ? 'Every selected component is installed and verified.'
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
          : 'Measuring download speed... estimates appear as data arrives.',
        COLORS.muted
      )
    }
    put(
      row++,
      `${progress?.engineReady ? '[ready]' : '[ ... ]'} Engine  ${v.engine.split('|').slice(1).join(' / ')}`
    )
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
        v.busy ? 'Loading model...' : 'Open workspace >',
        'Load your first model, then open the workspace.',
        focus
      )
    else {
      button(
        c,
        'setup-pause',
        x + 19,
        bottom,
        'Pause',
        'Pause all selected downloads and retain partial files.',
        focus
      )
      if (v.error || progress?.error)
        button(c, 'setup-back', x + 29, bottom, 'Change models', 'Review your model selections.', focus)
      button(
        c,
        'setup-retry',
        x,
        bottom,
        'Resume / retry',
        'Resume interrupted downloads. Existing files are kept.',
        focus
      )
    }
  }
  const error = v.error || v.progress?.error
  if (error) text(c, x, bottom - 1, error, COLORS.red, width)
  else if (v.busy)
    text(
      c,
      x,
      bottom - 1,
      'Working... You can still navigate with Tab or close with Ctrl+Q.',
      COLORS.muted,
      width
    )
}
