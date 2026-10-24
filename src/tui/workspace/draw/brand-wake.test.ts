import { expect, it } from 'vitest'
import { introPupil } from './brand-wake.js'
import { drawBrandMark } from './brand-mark.js'
import { canvas } from './canvas.js'
import { introCanvas } from '../intro-canvas.js'
import { INTRO_WORDMARK, SERVER_WORDMARK } from './brand-lettering.js'

it.each([
  [0, 'X'],
  [0.69, 'X'],
  [0.7, '-'],
  [1.19, '-'],
  [1.2, 'o'],
  [5, 'o'],
] as const)('wakes once at %s seconds with %s eyes', (seconds, pupil) => {
  expect(introPupil(seconds, true)).toBe(pupil)
  expect(introPupil(seconds, false)).toBe('o')
})

it('limits waking to the intro while preserving the stopped server eyes', () => {
  const face = (intro: boolean, status: Parameters<typeof drawBrandMark>[4], time: number) => {
    const c = canvas(42, 20)
    drawBrandMark(c, 1, 1, 'large', status, time, true, intro)
    return c.cells[9]!.slice(16, 23)
      .map((cell) => cell.char)
      .join('')
  }
  expect(face(true, 'welcome', 0)).toBe('(X) (X)')
  expect(face(true, 'welcome', 0.8)).toBe('(-) (-)')
  expect(face(true, 'welcome', 1.2)).toBe('(o) (o)')
  expect(face(false, 'welcome', 0)).toBe('(o) (o)')
  expect(face(true, 'stopped', 10)).toBe('(X) (X)')
})

it.each([
  [40, 16],
  [54, 24],
  [80, 24],
  [88, 32],
  [120, 36],
])('fits Atomic Server branding at %s×%s', (width, height) => {
  const c = introCanvas(width!, height!, 1.2, false, 'Press any key')
  const shown = c.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
  const title = width! >= 88 ? INTRO_WORDMARK : width! >= 75 ? SERVER_WORDMARK : ['A T O M I C   S E R V E R']
  for (const line of title) expect(shown).toContain(line.trimEnd())
  expect(shown).not.toContain('C H A T')
  expect(c.targets.every((target) => target.y + target.height <= height!)).toBe(true)
})
