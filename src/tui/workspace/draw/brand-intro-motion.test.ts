import { expect, it } from 'vitest'
import { animatedIntroContour } from './brand-intro-motion.js'
import { armPoses } from './brand-arm-timing.js'
import { LARGE_MARK } from './brand-mark.js'

it('moves each arm independently with irregular dwell and direction', () => {
  const samples = Array.from({ length: 600 }, (_, i) => armPoses(i / 10, true, 'running'))
  for (let arm = 0; arm < 8; arm++) {
    expect(new Set(samples.map((p) => p[arm]))).toEqual(new Set([-1, 0, 1]))
    for (let other = arm + 1; other < 8; other++)
      expect(samples.some((p) => !!p[arm] !== !!p[other])).toBe(true)
  }
  expect(samples).toEqual(Array.from({ length: 600 }, (_, i) => armPoses(i / 10, true, 'running')))
  const busy = samples.flat().filter(Boolean).length
  const subtle = Array.from({ length: 600 }, (_, i) => armPoses(i / 10, true, 'running', true))
    .flat()
    .filter(Boolean).length
  expect(subtle).toBeLessThan(busy / 2)
})

it('waits for wake-up and respects stopped, error and reduced-motion states', () => {
  for (const status of ['welcome', 'running', 'starting', 'stopped', 'error'] as const)
    expect(armPoses(6.2, false, status)).toEqual(Array(8).fill(0))
  for (const status of ['stopped', 'error'] as const)
    expect(armPoses(6.2, true, status)).toEqual(Array(8).fill(0))
  for (const time of [0, 0.5, 1.19])
    expect(animatedIntroContour(LARGE_MARK, 'large', time, true, 'welcome')).toEqual(LARGE_MARK)
  expect(animatedIntroContour(LARGE_MARK, 'large', 6.2, false, 'welcome')).toEqual(LARGE_MARK)
})
