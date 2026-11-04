import { expect, it } from 'vitest'
import { AtomicCoreError } from '@atomic-chat/core'
import { AtcError } from '../errors/index.js'
import { explained, oneLine } from './error-text.js'
it('keeps the details and hint in the expanded view, and just the hint on one line', () => {
  const error = new AtcError('ATC_USAGE', 'message', { details: 'details', hint: 'hint' })
  expect(oneLine(error)).toBe('message — hint')
  expect(explained(error)).toBe('message\ndetails\nHint: hint')
})

it("leaves the core's load-diag line out of the expanded view", () => {
  const error = new AtomicCoreError(
    'GPU_BACKEND_INCOMPATIBLE',
    'This GPU build cannot run here.',
    'ptx error\natomic-core-diag {"exit_code":"0x1","stage":"load"}'
  )
  expect(explained(error)).toBe('This GPU build cannot run here.\nptx error')
})
