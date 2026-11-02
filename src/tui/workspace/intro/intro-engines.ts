import type { EngineChoice } from '../../../terminal-setup/index.js'
import { engineName } from '../../../workspace-view/index.js'
import { computeRowWindow } from '../../row-window.js'
import { canvas, text, button, COLORS, wrapWords } from '../draw/canvas.js'
import { card } from '../draw/cards.js'
import { atomicHeader, brandHeaderRows } from '../draw/brand-header.js'

export function drawIntroEngines(
  columns: number,
  rows: number,
  choices: EngineChoice[],
  selected: number,
  error: string,
  seconds = 0
) {
  const c = canvas(columns, rows),
    width = Math.min(72, columns - 4),
    x = Math.floor((columns - width) / 2),
    headingY = brandHeaderRows(columns, rows)
  atomicHeader(c)
  text(c, x, headingY, 'Choose your engine', COLORS.accent, width)
  const height = rows >= 30 ? 5 : 3
  const errorLines = wrapWords(error, width)
  const errorTop = error
    ? Math.max(headingY + (choices.length ? height + 3 : 4), rows - 4 - errorLines.length)
    : rows - 3
  const window = computeRowWindow(
    choices.length,
    selected,
    Math.max(1, Math.floor((errorTop - headingY - 3) / height))
  )
  choices.slice(window.start, window.start + window.count).forEach((choice, i) =>
    card(c, {
      id: `engine:${window.start + i}`,
      x,
      y: headingY + 2 + i * height,
      width,
      height,
      title: `${engineName(choice.provider)}${choice.installed ? ' [Installed]' : ''}`,
      detail: `${choice.version} / ${choice.backend}`,
      icon: '[*]',
      focus: `engine:${selected}`,
      seconds,
    })
  )
  if (!choices.length)
    text(
      c,
      x,
      headingY + 2,
      error ? 'Engines could not be checked.' : 'Finding compatible engines...',
      COLORS.muted,
      width
    )
  if (error) {
    errorLines
      .slice(0, Math.max(0, rows - 4 - errorTop))
      .forEach((line, i) => text(c, x, errorTop + i, line, COLORS.statusError, width))
    button(c, 'retry', x, rows - 3, 'Retry', 'Reload compatible engines', '')
  }
  text(
    c,
    x,
    rows - 2,
    choices.length ? 'Arrows Choose  Enter Select' : error ? 'Enter Retry' : '',
    COLORS.muted,
    width
  )
  button(c, 'back', x, rows - 1, 'Esc Back', 'Return to the intro', '')
  button(c, 'skip', columns - 26, rows - 1, 'S Set up later', 'Continue without installing', '')
  button(c, 'quit', columns - 9, rows - 1, '^Q Quit', 'Close the terminal', '')
  return c
}
