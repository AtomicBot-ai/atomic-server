import { expect, it } from 'vitest'
import { unicodeRendererProbe } from '../helpers/unicode-renderer.js'

it('renders repeated Unicode and malformed UTF-16 through Ink under either runtime', () => {
  const result = unicodeRendererProbe()
  expect(result.frames).toBe(156)
  expect(result.characters).toBeGreaterThan(1_000)
})
