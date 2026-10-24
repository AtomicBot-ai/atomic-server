import { actionButton } from '../draw/cards.js'
import { button, COLORS, text, wrapWords } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { drawDownloadCard } from './download-card.js'
import { drawSetupBrowser, engineCheckFailed } from './setup-browser.js'
import { drawSetupReview } from './setup-review.js'
import { drawPathDownload, drawPathModels, drawPathReview } from './engine-setup-view.js'
import { drawFirstModel, isFirstModel } from './first-model.js'
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
  if (isFirstModel(s)) return drawFirstModel(c, s, focus, seconds)
  const error = v.error || v.progress?.error
  const preparationFailed = v.preparing && Boolean(error) && !v.busy
  let contentBottom = bottom
  const put = (dy: number, value: string, color: string = COLORS.text) => {
    if (y + dy < contentBottom) text(c, x, y + dy, value, color, width)
  }
  put(
    0,
    s.connection?.pickingModel
      ? 'Choose a model'
      : s.setupComplete
        ? v.stage === 'engine'
          ? 'Inference engines'
          : v.stage === 'models'
            ? 'Discover models'
            : 'Downloads'
        : v.stage === 'models'
          ? 'Choose your first model'
          : v.stage === 'review'
            ? 'Download needs attention'
            : 'Model setup',
    COLORS.gold
  )
  if (s.setupComplete || s.connection?.pickingModel)
    button(
      c,
      s.connection?.pickingModel ? 'guide-model-back' : 'library-close',
      x,
      y + 1,
      s.connection?.pickingModel ? 'Back to connection' : '‹ Your library',
      'Return to your model library | Downloads continue in background',
      focus
    )
  const area = { x, y, width, bottom, focus }
  if (v.path && v.stage === 'models') drawPathModels(c, s, v, area)
  else if (v.path && v.stage === 'review') drawPathReview(c, v, area)
  else if (v.path && (v.stage === 'download' || v.stage === 'ready')) drawPathDownload(c, s, v, area)
  else if (v.stage === 'review') {
    drawSetupReview(c, v, x, y, width, bottom, focus)
  } else if (v.stage === 'engine' || v.stage === 'models') {
    drawSetupBrowser(c, s, x, y, width, bottom, focus)
  } else {
    contentBottom = bottom - 3
    const progress = v.progress,
      ready = progress?.ready
    let row = 3
    if (progress?.speed)
      put(
        row++,
        `${bytes(progress.speed)}/s${progress.eta ? ` · ${Math.ceil(progress.eta / 60)} min left` : ''}`,
        COLORS.muted
      )
    if (v.preparing) {
      put(row++, v.pending?.repo ?? v.repository, COLORS.text)
      if (preparationFailed) {
        put(row++, 'Model setup stopped', COLORS.gold)
        for (const line of wrapWords(error!, width)) put(row++, line, COLORS.red)
      } else {
        const track = Array.from({ length: Math.min(30, width - 4) }, (_, i) =>
          Math.abs(i - (Math.floor(seconds * 4) % Math.min(30, width - 4))) < 2 ? '=' : '.'
        ).join('')
        put(row++, `[${track}] Preparing`, COLORS.gold)
      }
    }
    if (!v.preparing) {
      const count = c.targets.length
      drawDownloadCard(c, s, x, y + 3, width, s.selected, focus)
      c.targets.splice(count, 1)
      if (v.selections[s.selected])
        c.targets.splice(count, 0, {
          id: `setup-job:${s.selected}`,
          x,
          y: y + 3,
          width,
          height: 5,
          hint: 'View this download',
        })
    }
    if (ready && !s.connection?.pickingModel)
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
      if (preparationFailed)
        actionButton(
          c,
          'setup-retry',
          x,
          bottom - 2,
          'Retry',
          'Retry this model’s compatibility check.',
          focus
        )
      else button(c, 'setup-cancel', x, bottom, '< Cancel', 'Cancel preparation and return to models.', focus)
    } else if (
      !c.targets.some(
        (target) => target.id.startsWith('download-pause:') || target.id.startsWith('download-resume:')
      )
    ) {
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
  if (s.firstRun && ['download', 'ready'].includes(v.stage) && !v.preparing && !s.connection?.pickingModel)
    actionButton(c, 'first-continue', x, bottom - 3, 'Continue', 'Continue while the model downloads', focus)
  if (s.firstRun && !s.connection?.pickingModel)
    button(
      c,
      'first-skip',
      x + Math.max(0, width - 13),
      y + 1,
      'Skip setup',
      'Open Server; background downloads continue',
      focus
    )
  // The engine screen shows a failed check in full; elsewhere one line fits above the buttons.
  if (engineCheckFailed(v)) return
  if (error && !preparationFailed) text(c, x, bottom - 1, error.split('\n')[0]!, COLORS.red, width)
  else if (v.busy) text(c, x, bottom - 1, v.preparing ? 'Checking model…' : 'Working…', COLORS.stone, width)
}
