import { expect, it } from 'vitest'
import { isRemoteError, markReported, remoteError, wasReported } from './ownership.js'
it('preserves the original error and distinguishes local, remote and reported errors', () => {
  const error = new Error('x')
  expect(isRemoteError(error)).toBe(false)
  expect(wasReported(error)).toBe(false)
  expect(remoteError(error)).toBe(error)
  expect(isRemoteError(error)).toBe(true)
  markReported(error)
  expect(wasReported(error)).toBe(true)
  markReported('primitive')
  expect(wasReported('primitive')).toBe(false)
})
