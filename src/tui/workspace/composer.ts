import { COLORS, graphemes, text, textWidth, wrap } from './canvas.js'
import type { Canvas } from './canvas.js'
import { fill } from './fortress.js'
import type { WorkspaceState } from './state.js'

/** The editor and its actions share one framed surface and non-overlapping mouse targets. */
export function drawComposer(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  focus: string
) {
  fill(c, x, y, width, 5, COLORS.composerFrame)
  fill(c, x + 1, y + 1, width - 2, 3, COLORS.composer)
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
  const editorWidth = width - 14,
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
        x + 2,
        y + 1 + i,
        row,
        s.draft ? COLORS.composerInk : COLORS.stone,
        editorWidth,
        COLORS.composer
      )
    )
  c.targets.push({
    id: 'composer',
    x: x + 1,
    y: y + 1,
    width: editorWidth + 2,
    height: 2,
    hint: 'Enter Send | Shift+Enter New line | Esc Menu | Ctrl+N New chat',
  })
  control(
    s.generating ? 'cancel' : 'send',
    x + width - 10,
    y + 1,
    8,
    s.generating ? 'Stop' : 'Send ↑',
    s.generating ? 'Ctrl+C Stop response' : 'Enter Send message',
    COLORS.sendButton,
    COLORS.composerInk
  )
  const engineWidth = 12
  control(
    'choose-engine',
    x + 2,
    y + 3,
    engineWidth,
    'Engine ▾',
    'Choose an inference engine | Enter Open picker',
    COLORS.engineButton,
    COLORS.composer
  )
  control(
    'choose-model',
    x + engineWidth + 3,
    y + 3,
    Math.min(64, width - engineWidth - 5),
    s.model ? `Model: ${s.model} ▾` : 'Model ▾',
    s.model ? `${s.model} | Choose a model` : 'Choose a model from your library or endpoint',
    COLORS.modelButton,
    COLORS.composerInk
  )
}
