import { expect, it } from 'vitest'
import { canvas, COLORS, text } from './canvas.js'
import { tooltip } from './tooltip.js'

it('separates hint clauses without changing model filenames, versions or URLs', () => {
  const c = canvas(120, 2)
  tooltip(c, 0, 0, 'model.v2.gguf. Open http://127.0.0.1:13437/v1.\nEnter Confirm | Esc Cancel.', 120)
  expect(
    c.cells[0]!.map((cell) => cell.char)
      .join('')
      .trim()
  ).toBe('model.v2.gguf | Open http://127.0.0.1:13437/v1 | Enter Confirm | Esc Cancel')
  expect(c.cells[0]![0]!.color).toBe(COLORS.stone)
})

it('preserves the inverted composer surface underneath wide Unicode characters', () => {
  const c = canvas(8, 1)
  text(c, 0, 0, '界👁', COLORS.ground, 8, COLORS.text)
  expect(c.cells[0]!.slice(0, 4).every((cell) => cell.background === COLORS.text)).toBe(true)
})

it('keeps shortcut clauses intact when a compact footer cannot fit them all', () => {
  const c = canvas(50, 1)
  tooltip(c, 0, 0, 'Enter Send | Alt+Enter New line | Esc Menu | Ctrl+N New chat', 50)
  expect(
    c.cells[0]!.map((cell) => cell.char)
      .join('')
      .trim()
  ).toBe('Enter Send | Alt+Enter New line | Esc Menu')
})
