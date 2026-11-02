import { expect, it } from 'vitest'
import { nativeFailureTags } from './native-diagnostics.js'

it.each([
  new TypeError('private-prompt-value'),
  new TypeError('failed to initialize Segments private-prompt-value'),
  new TypeError('private-prompt-value failed to initialize Segments'),
  new TypeError('failed to initialize Segments\nprivate-prompt-value'),
  new Error('failed to initialize Segments'),
  { name: 'TypeError', message: 'failed to initialize Segments' },
  'failed to initialize Segments',
  undefined,
])('does not infer a runtime diagnostic from arbitrary text or non-TypeError values: %s', (error) => {
  expect(nativeFailureTags(error)).toEqual({})
})
