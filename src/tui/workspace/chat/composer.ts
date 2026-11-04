import { draftLoadAvailable } from './draft-load.js'
import { COLORS, graphemes, text, textWidth, wrap } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { fill } from '../draw/fortress.js'
import type { WorkspaceState } from '../state.js'
import { drawLoadLine } from './chat-load.js'

export const COMPOSER_HEIGHT = 7

/** The editor and its actions share one framed surface and non-overlapping mouse targets. */
export function drawComposer(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  focus: string,
  seconds = 0
) {
  fill(c, x, y, width, COMPOSER_HEIGHT, COLORS.ground)
  const border = s.focus === 'composer' ? COLORS.accent : COLORS.line
  text(c, x, y, '+' + '-'.repeat(Math.max(0, width - 2)) + '+', border, width)
  text(c, x, y + COMPOSER_HEIGHT - 1, '+' + '-'.repeat(Math.max(0, width - 2)) + '+', border, width)
  for (let row = 1; row < COMPOSER_HEIGHT - 1; row++) {
    text(c, x, y + row, '|', border, 1)
    text(c, x + width - 1, y + row, '|', border, 1)
  }
  drawLoadLine(c, s, x + 3, y + 1, width - 6, focus, seconds)
  const control = (
    id: string,
    left: number,
    row: number,
    size: number,
    label: string,
    hint: string,
    background: string,
    ink: string
  ) => {
    const active = focus === id
    const ending = label.endsWith('▾') ? '… ▾' : '…'
    const content =
      textWidth(label) > size - 2 ? (wrap(label, size - 2 - textWidth(ending))[0] ?? '') + ending : label
    const shown = (active ? '>' : ' ') + content + ' '.repeat(Math.max(1, size - 1 - textWidth(content)))
    text(c, left, row, shown, active ? COLORS.ground : ink, size, active ? COLORS.accent : background, true)
    c.targets.push({ id, x: left, y: row, width: size, height: 1, hint })
  }
  const load = draftLoadAvailable(s)
  const editorWidth = width - (load ? 23 : 16),
    chars = graphemes(s.draft)
  if (s.focus === 'composer' && !s.overlay) chars.splice(s.cursor, 0, '▏')
  const content = s.draft
    ? chars.join('')
    : s.focus === 'composer'
      ? '▏ Write a message...'
      : 'Write a message...'
  wrap(content, editorWidth)
    .slice(-2)
    .forEach((row, i) =>
      text(c, x + 3, y + 2 + i, row, s.draft ? COLORS.text : COLORS.muted, editorWidth, COLORS.ground)
    )
  c.targets.push({
    id: 'composer',
    x: x + 2,
    y: y + 2,
    width: editorWidth + 2,
    height: 2,
    hint: 'Enter Send | Shift+Enter New line | Esc Menu | Ctrl+N New chat',
  })
  if (s.generating || s.draft.trim() || s.documents?.length || s.images.length)
    control(
      s.generating ? 'cancel' : load ? 'load-and-send' : 'send',
      x + width - (load ? 18 : 11),
      y + 2,
      load ? 15 : 8,
      s.generating ? (s.stopping ? 'Stopping' : 'Stop') : load ? 'Load & send' : 'Send ↑',
      s.generating
        ? 'Ctrl+C Stop response'
        : load
          ? 'Load this installed model and send the retained draft'
          : 'Enter Send message',
      COLORS.sendButton,
      COLORS.composerInk
    )
  if (s.model)
    control(
      'model-details',
      x + width - 18,
      y + 5,
      15,
      'Model details',
      'Show the full model name and readiness',
      COLORS.surface,
      COLORS.text
    )
  control(
    'choose-model',
    x + 14,
    y + 4,
    Math.max(15, width - (width < 65 ? 17 : 30)),
    s.model ? `${s.model} ▾` : 'Choose model ▾',
    s.model ? `${s.model} | Choose a model` : 'Choose a model from your library or endpoint',
    COLORS.surface,
    COLORS.text
  )
  control(
    'chat-features',
    width < 65 ? x + 3 : x + width - 14,
    y + (width < 65 ? 5 : 4),
    11,
    'Tools ▾',
    'Choose assistant, skills and tools',
    COLORS.surface,
    COLORS.text
  )
  control(
    'attachments',
    x + 3,
    y + 4,
    9,
    (s.documents?.length ?? 0) + s.images.length
      ? `Files ${(s.documents?.length ?? 0) + s.images.length}`
      : '+ Files',
    'Attach documents or images',
    COLORS.surface,
    COLORS.text
  )
}
