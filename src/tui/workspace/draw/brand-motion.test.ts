import { expect, it } from 'vitest'
import { HEADER_MARK, SMALL_MARK } from './brand-mark.js'
import { workspaceFrame } from '../frame.js'
import { createWorkspace } from '../state.js'
import { animatedContour } from './brand-motion.js'
import { animatedIntroContour } from './brand-intro-motion.js'

it('preserves the supplied small artwork with the requested top cap', () => {
  expect(HEADER_MARK.map((row) => row.trimEnd())).toEqual([
    '  ___ _ ___',
    ' _\\ \\| |/ /_',
    '[_  (o)(o) _]',
    '  / /| |\\ \\',
  ])
  expect(SMALL_MARK).toEqual(HEADER_MARK)
  expect(HEADER_MARK.every((row) => row.length === 13)).toBe(true)
  for (const status of ['welcome', 'running', 'starting', 'stopped', 'error'] as const)
    for (let time = 0; time < 30; time += 0.25) {
      expect(animatedContour(HEADER_MARK, 6, time, true, status)).toEqual(HEADER_MARK)
      expect(animatedIntroContour(SMALL_MARK, 'small', time, true, status)).toEqual(SMALL_MARK)
    }
})

it.each([
  [54, 24],
  [80, 24],
  [90, 32],
  [120, 36],
])('keeps controls stable at %s×%s during independent arm motion', (width, height) => {
  const s = createWorkspace('server')
  const still = workspaceFrame(s, width!, height!, 0)
  for (const time of [0.7, 2.4, 6.2, 9.8])
    expect(workspaceFrame(s, width!, height!, time).targets).toEqual(still.targets)
  expect(still.targets.every((t) => t.y + t.height <= height!)).toBe(true)
})
