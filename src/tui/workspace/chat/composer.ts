import { COLORS, graphemes, text, textWidth, wrap } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import { fill } from '../draw/fortress.js'
import type { WorkspaceState } from '../state.js'

export const COMPOSER_HEIGHT = 7

/** The editor and its actions share one framed surface and non-overlapping mouse targets. */
export function drawComposer(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  focus: string
) {
  fill(c, x, y, width, COMPOSER_HEIGHT, COLORS.composerFrame)
  fill(c, x + 2, y + 1, width - 4, COMPOSER_HEIGHT - 2, COLORS.composer)
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
    const shown = ' ' + content + ' '.repeat(Math.max(1, size - 1 - textWidth(content)))
    text(c, left, row, shown, active ? background : ink, size, active ? ink : background, true)
    c.targets.push({ id, x: left, y: row, width: size, height: 1, hint })
  }
  const editorWidth = width - 16,
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
      text(
        c,
        x + 3,
        y + 2 + i,
        row,
        s.draft ? COLORS.composerInk : COLORS.stone,
        editorWidth,
        COLORS.composer
      )
    )
  c.targets.push({
    id: 'composer',
    x: x + 2,
    y: y + 2,
    width: editorWidth + 2,
    height: 2,
    hint: 'Enter Send | Shift+Enter New line | Esc Menu | Ctrl+N New chat',
  })
  control(
    s.generating ? 'cancel' : 'send',
    x + width - 11,
    y + 2,
    8,
    s.generating ? 'Stop' : 'Send ↑',
    s.generating ? 'Ctrl+C Stop response' : 'Enter Send message',
    COLORS.sendButton,
    COLORS.composerInk
  )
  const engineWidth = 12
  control(
    'choose-engine',
    x + 3,
    y + 4,
    engineWidth,
    'Engine ▾',
    'Choose an inference engine | Enter Open picker',
    COLORS.engineButton,
    COLORS.composer
  )
  control(
    'choose-model',
    x + engineWidth + 4,
    y + 4,
    Math.min(64, width - engineWidth - 18),
    s.model ? `Model: ${s.model} ▾` : 'Model ▾',
    s.model ? `${s.model} | Choose a model` : 'Choose a model from your library or endpoint',
    COLORS.modelButton,
    COLORS.composerInk
  )
  control(
    'images',
    x + width - 12,
    y + 4,
    9,
    s.images.length ? `Images ${s.images.length}` : '+ Image',
    'Attach a local image | Requires a vision model',
    COLORS.engineButton,
    COLORS.composer
  )
}
