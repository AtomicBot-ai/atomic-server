import { expect, it } from 'vitest'
import { canvas, COLORS, text } from './canvas.js'
import { workspaceFrame } from '../frame.js'
import { createWorkspace } from '../state.js'
import { dimBackdrop } from './backdrop.js'

it('preserves page characters and geometry while dimming text and bright surfaces', () => {
  const c = canvas(30, 2)
  text(c, 0, 0, 'Start server', COLORS.ground, 30, COLORS.gold, true)
  text(c, 0, 1, 'Model ready', COLORS.text)
  const before = c.cells.map((row) => row.map((cell) => cell.char).join(''))
  dimBackdrop(c)
  expect(c.cells.map((row) => row.map((cell) => cell.char).join(''))).toEqual(before)
  expect(c.cells[0]![0]!.background).not.toBe(COLORS.gold)
  expect(c.cells[0]![0]!.bold).toBe(false)
  for (const row of c.cells)
    for (const cell of row)
      for (const color of [cell.color, cell.background!]) {
        expect(color.slice(1, 3)).toBe(color.slice(3, 5))
        expect(color.slice(3, 5)).toBe(color.slice(5, 7))
      }
})

it.each([
  'feature-editor',
  'feature-delete',
  'chat-features',
  'chat-tools',
  'cloud',
  'catalog-menu',
  'catalog-filters',
  'help',
] as const)('dims the page before rendering the %s popup, including early dispatch branches', (overlay) => {
  const state = {
    ...createWorkspace('server'),
    setupComplete: true,
    overlay,
    featureEditor: { kind: 'assistants' as const, value: {} },
  }
  const background = workspaceFrame({ ...state, overlay: null }, 120, 40, 0)
  const modal = workspaceFrame(state, 120, 40, 0)
  const header = background.cells[3]!.findIndex((cell, x) => x < 20 && cell.char.trim())
  expect(header).toBeGreaterThanOrEqual(0)
  expect(modal.cells[3]![header]!.char).toBe(background.cells[3]![header]!.char)
  expect(modal.cells[3]![header]!.color).not.toBe(background.cells[3]![header]!.color)
  const visible = modal.cells.flat().filter((cell) => cell.char.trim())
  expect(visible.some((cell) => cell.color === COLORS.text || cell.color === COLORS.gold)).toBe(true)
})
