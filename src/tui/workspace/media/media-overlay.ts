import { button, COLORS, text } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { actionButton, panel } from '../draw/cards.js'
import { record } from '../library/library-model.js'
import type { WorkspaceState } from '../state.js'
import { mediaTask } from './media-model.js'
import { drawMediaGallery } from './media-gallery.js'

export function drawMediaOverlay(c: Canvas, s: WorkspaceState, focus: string) {
  if (s.overlay !== 'media-models' && s.overlay !== 'media-stop' && s.overlay !== 'media-preview')
    return false
  if (s.overlay === 'media-preview') {
    c.targets = []
    drawMediaGallery(c, s, 4, 3, c.width - 8, c.height - 5, focus)
    return true
  }
  const width = Math.min(64, c.width - 8),
    x = Math.floor((c.width - width) / 2),
    y = 3
  const height = Math.min(
    c.height - 7,
    s.overlay === 'media-stop' ? 10 : Math.max(9, s.media.models.length * 3 + 6)
  )
  panel(c, x, y, width, height)
  c.popover = { x, y, width, height }
  c.targets = []
  if (s.overlay === 'media-stop') {
    text(c, x + 2, y + 1, 'Stop generation?', COLORS.text, width - 4, undefined, true)
    text(c, x + 2, y + 3, 'The unfinished result will be discarded.', COLORS.muted, width - 4)
    if (s.media.error) text(c, x + 2, y + 4, s.media.error, COLORS.red, width - 4)
    button(c, 'media-keep', x + 2, y + 6, 'Keep generating', 'Return to the current generation', focus)
    actionButton(
      c,
      'media-stop-confirm',
      x + width - 23,
      y + 5,
      'Stop generation',
      'Cancel the current job',
      focus
    )
  } else {
    text(c, x + 2, y + 1, 'Choose a model', COLORS.text, width - 4, undefined, true)
    const capacity = Math.max(1, Math.floor((height - 6) / 3)),
      selected = Number(focus.slice(12)) || 0
    const offset = Math.max(0, Math.min(selected - capacity + 1, s.media.models.length - capacity))
    s.media.models.slice(offset, offset + capacity).forEach((model, i) => {
      const plan = record(model['plan'])
      text(
        c,
        x + 2,
        y + 3 + i * 3,
        String(model['name'] ?? plan['name'] ?? model['id']),
        COLORS.text,
        width - 18
      )
      button(
        c,
        `media-model:${offset + i}`,
        x + width - 14,
        y + 3 + i * 3,
        'Load model',
        'Load this downloaded model',
        focus
      )
    })
    if (s.media.loading || s.media.error || !s.media.models.length)
      text(
        c,
        x + 2,
        y + 3,
        s.media.loading
          ? 'Reading downloaded models…'
          : s.media.error || `No ${mediaTask(s)} models downloaded.`,
        s.media.error ? COLORS.red : COLORS.muted,
        width - 4
      )
    button(
      c,
      'media-browse',
      x + 2,
      y + height - 2,
      'Browse models',
      'Find compatible models in the catalog',
      focus
    )
  }
  return true
}
