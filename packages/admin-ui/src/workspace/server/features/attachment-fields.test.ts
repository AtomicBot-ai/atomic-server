import { expect, it } from 'vitest'
import { DEFAULT_ATTACHMENTS } from '@contract'
import { attachmentFieldError } from './attachment-fields'
import type { NumericKey } from './attachment-fields'

it.each<[NumericKey, number | string, string]>([
  ['max_file_size_mb', '', 'Enter a value.'],
  ['max_file_size_mb', 101, 'Enter a value from 1 to 100.'],
  ['retrieval_limit', 1.5, 'Enter a whole number.'],
  ['retrieval_threshold', 0.123, ''],
  ['auto_inline_context_ratio', 0.75, ''],
  ['overlap_chars', 2000, 'Chunk overlap must be smaller than chunk size.'],
])('validates the %s draft %s', (key, value, error) => {
  expect(attachmentFieldError(key, { ...DEFAULT_ATTACHMENTS, [key]: value })).toBe(error)
})
