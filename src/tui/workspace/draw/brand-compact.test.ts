import { expect, it } from 'vitest'
import { canvas } from './canvas.js'
import { COMPACT_MARK, drawBrandMark, LARGE_MARK, HEADER_MARK, BRAND_SHADOW } from './brand-mark.js'
import { paintArmPoses } from './brand-arm-poses.js'
import { introCanvas } from '../intro-canvas.js'
import { contourSilhouette } from './brand-silhouette.js'
import { animatedIntroContour } from './brand-intro-motion.js'

const approved = String.raw`
           .----.
    .--.   |    |   .--.
    |   \__|    |__/   |
    '._              _.'
 .-----'   .-..-.   '-----.
 |         (o)(o)         |
 '-----.   '-''-'   .-----'
    .-'              '-.
    |   /--|    |--\   |
    '--'   |    |   '--'
           '----'`
  .split('\n')
  .slice(1)
  .map((row) => row.padEnd(27))

it('renders the selected Soft socket outline and close eye sockets exactly', () => {
  const c = canvas(27, 11)
  drawBrandMark(c, 0, 0, 'compact', 'welcome', 0, false)
  expect(c.cells.map((row) => row.map((cell) => cell.char).join(''))).toEqual(approved)
  expect(COMPACT_MARK).toHaveLength(11)
  expect(COMPACT_MARK.every((row) => row.length === 27)).toBe(true)
})

it('moves the compact top cap one cell either way around a stationary centered stem', () => {
  const centers = [-1, 1].map((pose) => {
    const result = paintArmPoses(COMPACT_MARK, 'compact', [pose])
    const first = result[0]!.indexOf('.----.')
    expect(first).toBeGreaterThanOrEqual(10)
    expect(first).toBeLessThanOrEqual(12)
    expect(result[1]!.slice(11, 17)).toBe('|    |')
    return first + 2.5
  })
  expect(centers.sort()).toEqual([12.5, 14.5])
})

it.each([
  [44, 22],
  [54, 24],
  [80, 24],
  [88, 24],
  [100, 30],
])('centers the complete medium mark with clear title and action gaps at %s×%s', (width, height) => {
  const c = introCanvas(width!, height!, 0, false, 'Press any key')
  const rows = c.cells.map((row) =>
    row.map((cell) => (cell.color === BRAND_SHADOW ? ' ' : cell.char)).join('')
  )
  const x = Math.floor((width! - 27) / 2)
  for (let row = 0; row < approved.length; row++) expect(rows[row + 1]!.slice(x, x + 27)).toBe(approved[row])
  const eyes = rows[6]!.indexOf('(o)(o)')
  expect(Math.abs(eyes + 2.5 - (width! - 1) / 2)).toBeLessThanOrEqual(0.5)
  expect(c.cells[13]!.every((cell) => cell.char === ' ')).toBe(true)
  const action = c.targets.find((target) => target.id === 'intro-continue')!
  expect(rows[action.y - 1]!.trim()).toBe('')
  expect(action.y + action.height).toBeLessThanOrEqual(height!)
  expect(c.cells.every((row) => row.length === width)).toBe(true)
})

it('preserves the approved large and header artwork outside medium dimensions', () => {
  for (const [width, height, mark, y] of [
    [90, 32, LARGE_MARK, 2],
    [60, 20, HEADER_MARK, 1],
  ] as const) {
    const c = introCanvas(width, height, 0, false, 'Press any key')
    const expected = canvas(width, height)
    drawBrandMark(
      expected,
      Math.floor((width - mark[0]!.length) / 2),
      y,
      width === 90 ? 'large' : 'small',
      'welcome',
      0,
      false,
      true
    )
    const x = Math.floor((width - mark[0]!.length) / 2)
    for (let row = y; row < y + mark.length; row++)
      expect(c.cells[row]!.slice(x, x + mark[0]!.length)).toEqual(
        expected.cells[row]!.slice(x, x + mark[0]!.length)
      )
  }
})

it('keeps the compact body opaque and anchored throughout independent arm movement', () => {
  const originalMask = contourSilhouette(COMPACT_MARK, [3, 4, 5, 6, 7])
  for (let i = 0; i < 100; i++) {
    const time = i / 5
    const pose = animatedIntroContour(COMPACT_MARK, 'compact', time, true, 'welcome')
    const mask = contourSilhouette(pose, [3, 4, 5, 6, 7])
    for (let row = 3; row <= 7; row++) expect(pose[row]!.slice(5, 23)).toBe(COMPACT_MARK[row]!.slice(5, 23))
    for (let row = 3; row <= 7; row++)
      expect(mask[row]!.slice(5, 23)).toEqual(originalMask[row]!.slice(5, 23))
    const c = canvas(34, 16)
    drawBrandMark(c, 1, 1, 'compact', 'welcome', time, true, true)
    mask.forEach((row, y) =>
      row.forEach((opaque, x) => {
        if (opaque) expect(c.cells[y + 1]![x + 1]!.color).not.toBe(BRAND_SHADOW)
      })
    )
  }
})
