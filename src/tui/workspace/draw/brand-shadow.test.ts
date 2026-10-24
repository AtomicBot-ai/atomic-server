import { expect, it } from 'vitest'
import {
  BRAND_SHADOW,
  BRAND_COLORS,
  drawBrandMark,
  LARGE_MARK,
  COMPACT_MARK,
  SMALL_MARK,
} from './brand-mark.js'
import { canvas, COLORS, text } from './canvas.js'
import { animatedIntroContour } from './brand-intro-motion.js'
import { contourSilhouette } from './brand-silhouette.js'
import { introCanvas } from '../intro-canvas.js'
import { atomicHeader } from './brand-header.js'

it.each(['large', 'compact', 'small'] as const)(
  'offsets the %s intro shadow while keeping the face and white contour anchored',
  (size) => {
    for (const time of [0, 6.2]) {
      const plain = canvas(42, 20),
        shadow = canvas(42, 20)
      drawBrandMark(plain, 1, 1, size, 'running', time)
      drawBrandMark(shadow, 1, 1, size, 'running', time, true, true)
      const points = (c: typeof plain, color: string) =>
        c.cells.flatMap((row, y) =>
          row.flatMap((cell, x) =>
            cell.color === color && cell.char.trim() ? [{ x, y, char: cell.char }] : []
          )
        )
      const pupils = (c: typeof plain) => points(c, BRAND_COLORS.running)
      expect(pupils(shadow)).toEqual(pupils(plain))
      if (!time) expect(points(shadow, COLORS.text)).toEqual(points(plain, COLORS.text))
      expect(points(shadow, BRAND_SHADOW).length).toBeGreaterThan(5)
      expect(points(plain, BRAND_SHADOW)).toEqual([])
    }
  }
)

it.each([
  ['large', LARGE_MARK],
  ['compact', COMPACT_MARK],
  ['small', SMALL_MARK],
] as const)('keeps the %s body opaque in still and moving poses', (size, lines) => {
  for (const seconds of [0, 0.5, 1, 1.4, 6.2]) {
    const mask = contourSilhouette(
      animatedIntroContour([...lines], size, seconds, true, 'welcome'),
      size === 'compact' ? [3, 4, 5, 6, 7] : []
    )
    const c = canvas(44, 22)
    c.cells.forEach((_, y) => text(c, 0, y, 'z'.repeat(c.width), COLORS.gold))
    drawBrandMark(c, 1, 1, size, 'welcome', seconds, true, true)
    mask.forEach((row, y) =>
      row.forEach((opaque, x) => {
        if (!opaque) return
        const cell = c.cells[y + 1]![x + 1]!
        expect(cell.char).not.toBe('z')
        expect(cell.color).not.toBe(BRAND_SHADOW)
        expect(cell.background).toBe(COLORS.ground)
      })
    )
  }
})

it('fills the stem and arms without filling the gaps between them', () => {
  const mask = contourSilhouette(LARGE_MARK)
  expect(mask[3]![8]).toBe(true)
  expect(mask[3]![18]).toBe(true)
  expect(mask[3]![28]).toBe(true)
  expect(mask[3]![13]).toBe(false)
  expect(mask[3]![24]).toBe(false)
  expect(mask[8]![4]).toBe(true)
  expect(mask[8]![31]).toBe(true)
  expect(mask[12]![13]).toBe(false)
})

it.each([
  [40, 16],
  [54, 24],
  [80, 24],
  [120, 36],
])('keeps shadow and action visible at %s×%s without shadowing the header', (width, height) => {
  const intro = introCanvas(width!, height!, 6.2, true, 'Press any key')
  expect(intro.cells).toHaveLength(height!)
  intro.cells.forEach((row) => expect(row).toHaveLength(width!))
  const action = intro.targets.find((target) => target.id === 'intro-continue')!
  expect(action.y + action.height).toBeLessThanOrEqual(height!)
  expect(intro.cells.flat().some((cell) => cell.color === BRAND_SHADOW)).toBe(true)
  const header = canvas(width!, height!)
  atomicHeader(header)
  expect(header.cells.flat().some((cell) => cell.color === BRAND_SHADOW)).toBe(false)
  const still = introCanvas(width!, height!, 0, false, 'Press any key')
  expect(introCanvas(width!, height!, 6.2, false, 'Press any key')).toEqual(still)
})
