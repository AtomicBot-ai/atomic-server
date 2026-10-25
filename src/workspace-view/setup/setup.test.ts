import { expect, it } from 'vitest'
import { setupFinished } from './setup.js'

it('respects a saved manual choice independently of inference verification', () => {
  expect(setupFinished({ mode: 'manual', complete: false, updated_at: 1 })).toBe(true)
  expect(setupFinished({ mode: 'manual', complete: true, updated_at: 1 })).toBe(true)
})
it('keeps a fresh or unfinished guided setup open', () => {
  expect(setupFinished(null)).toBe(false)
  expect(setupFinished(undefined)).toBe(false)
  expect(setupFinished({ mode: 'guided', complete: false, updated_at: 1 })).toBe(false)
  expect(setupFinished({ mode: 'guided', complete: true, updated_at: 1 })).toBe(true)
})
