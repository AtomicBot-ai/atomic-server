import { expect, it } from 'vitest'
import { canvas } from './canvas.js'
import { drawRider } from './fortress.js'

it('lets the rider cross once per minute and keeps reduced motion still', () => {
  const render = (seconds: number, motion = true) => {
    const c = canvas(80, 24)
    drawRider(c, 18, seconds, motion)
    return c.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
  }
  expect(render(59).trim()).toBe('')
  expect(render(64).trim()).not.toBe('')
  expect(render(65)).not.toBe(render(64))
  expect(render(70).trim()).toBe('')
  expect(render(124)).toBe(render(64))
  expect(render(64, false).trim()).toBe('')
})
