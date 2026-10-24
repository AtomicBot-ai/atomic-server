import { button, COLORS, text, wrap } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { panel } from '../draw/cards.js'
import { record } from '../library/library-model.js'
import type { WorkspaceState } from '../state.js'
import { loadedMediaModel, mediaTask, pendingMedia } from './media-model.js'

export function drawMediaGallery(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  const task = mediaTask(s),
    item = s.media.gallery[s.media.selected],
    job = s.media.task === task ? s.media.job : null
  const pending = !!job && pendingMedia(s),
    progress = record(job?.['progress'])
  const compact = bottom - y < 16,
    contentY = y + (compact ? 1 : 4)
  panel(c, x, y, width, Math.max(6, bottom - y - 5))
  const center = x + Math.max(2, Math.floor((width - 13) / 2))
  if (!compact)
    text(c, center, y + 2, task === 'video' ? '[ > VIDEO < ]' : '[ # IMAGE # ]', COLORS.gold, width - 4)
  if (pending) {
    text(c, x + 2, contentY, `Generating ${task}…`, COLORS.text, width - 4, undefined, true)
    const count = Math.max(8, width - 6),
      fraction = Math.max(0, Math.min(1, Number(progress['fraction']) || 0))
    text(
      c,
      x + 2,
      contentY + 2,
      '[' +
        '#'.repeat(Math.round((count - 2) * fraction)) +
        '-'.repeat(count - 2 - Math.round((count - 2) * fraction)) +
        ']',
      COLORS.gold,
      count
    )
    text(
      c,
      x + 2,
      contentY + 3,
      `${progress['step'] ?? 0}/${progress['totalSteps'] ?? '?'} steps${progress['etaSeconds'] != null ? ` · ${Math.ceil(Number(progress['etaSeconds']))}s remaining` : ''}`,
      COLORS.muted,
      width - 4
    )
  } else if (item) {
    text(c, x + 2, contentY, String(item['name'] ?? item['id'] ?? 'Generated result'), COLORS.text, width - 4)
    wrap(String(record(item['recipe'])['prompt'] ?? 'No prompt recorded.'), width - 4)
      .slice(0, Math.max(1, bottom - y - 13))
      .forEach((line, i) => text(c, x + 2, contentY + 2 + i, line, COLORS.muted, width - 4))
    if (!compact)
      text(
        c,
        x + 2,
        bottom - 8,
        'Save to open the result in an image or video viewer.',
        COLORS.muted,
        width - 4
      )
  } else {
    text(
      c,
      x + 2,
      contentY,
      task === 'video' ? 'Your videos' : 'Your images',
      COLORS.text,
      width - 4,
      undefined,
      true
    )
    text(
      c,
      x + 2,
      contentY + 1,
      loadedMediaModel(s)
        ? 'Enter a prompt, then Generate.'
        : `Generated ${task === 'video' ? 'videos' : 'images'} appear here.`,
      COLORS.muted,
      width - 4
    )
    if (!loadedMediaModel(s))
      button(c, 'media-models', x + 1, contentY + 3, 'Choose a model', 'Load a downloaded media model', focus)
  }
  const error = s.media.error || String(record(job?.['error'])['message'] ?? job?.['error'] ?? '')
  if (error) text(c, x + 1, bottom - 5, error, COLORS.red, width - 2)
  if (item) {
    let bx = x
    for (const [id, label] of [
      ['media-previous', '<'],
      ['media-next', '>'],
      ['media-restore', 'Restore settings'],
      ['media-save', 'Save'],
    ])
      bx += button(c, id!, bx, bottom - 3, label!, label!, focus) + 1
    text(
      c,
      x,
      bottom - 1,
      `Gallery  ${s.media.selected + 1} / ${s.media.gallery.length}`,
      COLORS.text,
      width - 10
    )
  } else text(c, x, bottom - 1, 'Gallery', COLORS.text, width - 10)
  if (item) button(c, 'media-preview', x + 14, bottom - 1, 'Preview', 'Open result details', focus)
  button(c, 'media-refresh', x + width - 9, bottom - 1, 'Refresh', 'Read the latest results', focus)
}
