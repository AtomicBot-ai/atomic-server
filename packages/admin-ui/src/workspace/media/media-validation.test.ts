import { expect, it } from 'vitest'
import { mediaBounds, mediaFieldError, mediaFormErrors } from './media-validation'

it('uses capability dimensions, ranges and steps for both controls and validation', () => {
  const capabilities = { minDim: 256, maxDim: 1024, dimMultiple: 64, ranges: { steps: [4, 16] } }
  expect(mediaBounds(capabilities, 'width')).toEqual({ min: 256, max: 1024, step: 64 })
  expect(mediaBounds(capabilities, 'steps')).toEqual({ min: 4, max: 16, step: 1 })
  expect(mediaFieldError(capabilities, 'width', 768)).toBe('')
  expect(mediaFieldError(capabilities, 'width', 2048)).toContain('256 to 1024')
  expect(mediaFieldError(capabilities, 'width', 770)).toContain('increments of 64')
})

it.each([undefined, '', 512])('accepts an omitted/default or valid dimension (%s)', (value) => {
  expect(mediaFieldError({}, 'width', value)).toBe('')
})

it('validates only fields offered by the current task and model', () => {
  const values = {
    workflow: 'create',
    width: 512,
    height: 512,
    steps: 20,
    cfgScale: 7,
    frames: 200,
    batchSize: 3,
    guidance: 99,
    strength: 99,
  }
  expect(mediaFormErrors({ maxBatch: 4 }, values, 'image')).toEqual({})
  expect(Object.keys(mediaFormErrors({}, values, 'video'))).toEqual(['frames'])
  expect(Object.keys(mediaFormErrors({ supportsGuidance: true }, values, 'image'))).toEqual([
    'batchSize',
    'guidance',
  ])
})
