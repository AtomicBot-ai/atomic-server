import { canvas, button, COLORS, text } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { actionButton } from '../draw/cards.js'
import { fieldControl } from '../draw/controls.js'
import { drawViewport } from '../draw/viewport.js'
import { fieldValue } from '../operations/operation-model.js'
import type { WorkspaceState } from '../state.js'
import { loadedMediaModel, MEDIA_LABELS, mediaFields, mediaTask, pendingMedia } from './media-model.js'

import { drawMediaGallery } from './media-gallery.js'

export function drawMediaPanel(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  const task = mediaTask(s),
    wide = width >= 78,
    controlWidth = wide ? 36 : width
  const model = loadedMediaModel(s)
  const pending = pendingMedia(s),
    fields = mediaFields(s)
  text(c, x, y, task === 'video' ? 'Videos' : 'Images', COLORS.text, width, undefined, true)
  if (!wide && s.media.galleryView) {
    drawMediaGallery(c, s, x, y + 2, width, bottom - 2, focus)
    button(c, 'media-gallery', x, bottom, 'Controls', 'Return to generation controls', focus)
    return
  }
  const content = canvas(controlWidth, 10 + fields.length * 3 + (s.media.advanced ? 4 : 0))
  let row = 0
  for (const field of fields) {
    const name = field.path.replace('request.', ''),
      value = fieldValue(s.operationInput, field.path)
    const shown =
      value == null
        ? name === 'seed'
          ? 'Random'
          : 'Not set'
        : typeof value === 'object'
          ? 'Image selected'
          : String(value)
    text(content, 0, row, MEDIA_LABELS[name] ?? name, COLORS.muted, controlWidth - 2)
    fieldControl(
      content,
      `operation-field:${field.path}`,
      0,
      row + 1,
      controlWidth - 2,
      shown,
      MEDIA_LABELS[name] ?? name,
      focus,
      name === 'workflow'
    )
    row += 3
    if (name === 'workflow') {
      fieldControl(
        content,
        'media-models',
        0,
        row,
        controlWidth - 2,
        model || 'Choose a model',
        'Load a downloaded media model',
        focus,
        true
      )
      row += 2
    }
    if (name === 'prompt') {
      text(content, 0, row, 'Settings', COLORS.text, controlWidth - 10, undefined, true)
      button(content, 'media-reset', controlWidth - 9, row++, 'Reset', 'Reset generation settings', focus)
      row++
    }
  }
  button(
    content,
    'media-advanced',
    0,
    row++,
    `${s.media.advanced ? '▾' : '▸'} Advanced`,
    'Additional generation parameters',
    focus
  )
  if (s.media.advanced)
    button(
      content,
      'operation-json',
      0,
      row + 1,
      'Additional parameters',
      'Edit the complete generation request',
      focus
    )
  drawViewport(c, content, x, y + 2, controlWidth, bottom - y - 5, s.scroll, focus)
  if (pending) actionButton(c, 'media-stop', x, bottom - 2, 'Stop', 'Stop the current generation', focus)
  else if (!s.media.loading && model && String(fieldValue(s.operationInput, 'request.prompt') ?? '').trim())
    actionButton(
      c,
      'operation-run',
      x,
      bottom - 2,
      'Generate',
      'Generate from the prompt and settings',
      focus
    )
  else if (!s.media.loading) text(c, x + 2, bottom - 1, '[ Generate ]', COLORS.stone, controlWidth)
  else text(c, x, bottom - 1, 'Loading…', COLORS.muted, controlWidth)
  if (!wide)
    button(
      c,
      'media-gallery',
      x + controlWidth - 9,
      bottom - 1,
      'Gallery',
      'View generation progress and results',
      focus
    )
  else drawMediaGallery(c, s, x + 39, y + 2, width - 39, bottom, focus)
  if (s.media.error && !wide) text(c, x, bottom - 3, s.media.error, COLORS.red, width)
}
