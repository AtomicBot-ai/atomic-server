import { expect, it } from 'vitest'
import { button, canvas, hit } from './canvas.js'
import { drawViewport } from './viewport.js'

it('scrolls focus into view and clips hit targets with their visible rows', () => {
  const source = canvas(30, 40),
    result = canvas(50, 24)
  button(source, 'first', 2, 1, 'First', 'First', '')
  button(source, 'last', 2, 30, 'Last', 'Last', '')
  drawViewport(result, source, 10, 3, 30, 12, 0, 'last')
  expect(result.targets.map((target) => target.id)).toEqual(['last'])
  const target = result.targets[0]!
  expect(target.y).toBe(14)
  expect(hit(result, target.x, target.y)?.id).toBe('last')
  expect(result.cells[target.y]!.map((cell) => cell.char).join('')).toContain('Last')
})
