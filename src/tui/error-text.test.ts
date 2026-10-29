import { expect, it } from 'vitest'
import { AtcError } from '../errors/index.js'
import { explained, oneLine } from './error-text.js'
it('keeps the details and hint in the expanded view, and just the hint on one line', () => {
  const error = new AtcError('ATC_USAGE', 'message', { details: 'details', hint: 'hint' })
  expect(oneLine(error)).toBe('message — hint')
  expect(explained(error)).toBe('message\ndetails\nHint: hint')
})
