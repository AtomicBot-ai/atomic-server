import { expect, it } from 'vitest'
import { workspaceFrame } from '../frame.js'
import { createWorkspace } from '../state.js'
import { COLORS } from '../draw/canvas.js'

function luminance(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((channel) => {
      const value = Number.parseInt(channel, 16) / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722
}
function contrast(ink: string, background: string) {
  const pair = [luminance(ink), luminance(background)].sort((a, b) => a - b)
  return (pair[1]! + 0.05) / (pair[0]! + 0.05)
}

it.each([
  [54, 24],
  [90, 32],
  [120, 36],
])('keeps composer loading and failure text readable at %i×%i', (width, height) => {
  for (const focus of ['composer', 'choose-model', 'retry-load']) {
    for (const status of ['loading', 'error']) {
      const state = {
        ...createWorkspace('chat'),
        setupComplete: true,
        model: 'selected-model',
        draft: 'Keep this draft',
        focus,
        modelLoad: status === 'loading' ? { model: 'selected-model', provider: 'llamacpp-upstream' } : null,
        loadError:
          status === 'error'
            ? { model: 'selected-model', provider: 'llamacpp-upstream', message: 'Not enough memory' }
            : null,
      }
      const frame = workspaceFrame(state, width, height, 0)
      const composer = frame.targets.find((target) => target.id === 'composer')!
      const action = frame.targets.find(
        (target) => target.id === (status === 'loading' ? 'cancel-load' : 'retry-load')
      )!
      const cells = frame.cells[composer.y - 1]!.slice(composer.x + 1, action.x).filter((cell) =>
        cell.char.trim()
      )
      expect(cells.length).toBeGreaterThan(0)
      for (const cell of cells) {
        expect(cell.background).toBe(COLORS.composer)
        expect(contrast(cell.color, cell.background!)).toBeGreaterThanOrEqual(4.5)
      }
    }
  }
})

it('keeps the existing bright status color readable on dark surfaces', () => {
  expect(contrast(COLORS.red, COLORS.ground)).toBeGreaterThanOrEqual(4.5)
  expect(contrast(COLORS.composerError, COLORS.composer)).toBeGreaterThanOrEqual(4.5)
})
