import type { AttachmentSettings } from '@contract'

/** UI constraints mirror the server's attachment validation; the server remains authoritative. */
export const ATTACHMENT_NUMBERS = {
  max_file_size_mb: {
    label: 'Maximum file size',
    unit: 'MB',
    min: 1,
    max: 100,
    hint: 'Limit for each document you attach.',
  },
  retrieval_limit: {
    label: 'Passages per request',
    unit: 'passages',
    min: 1,
    max: 30,
    hint: 'Maximum number of matching passages sent to the model.',
  },
  retrieval_threshold: {
    label: 'Minimum relevance',
    min: 0,
    max: 1,
    hint: 'Higher values keep fewer, more relevant passages.',
    fractional: true,
  },
  chunk_size_chars: {
    label: 'Chunk size',
    unit: 'characters',
    min: 200,
    max: 10000,
    hint: 'Length of each passage when splitting a document.',
  },
  overlap_chars: {
    label: 'Chunk overlap',
    unit: 'characters',
    min: 0,
    max: 2000,
    hint: 'Text shared by neighboring passages to preserve context.',
  },
  auto_inline_context_ratio: {
    label: 'Automatic inline ratio',
    min: 0.05,
    max: 1,
    hint: 'Fraction of the automatic text budget used before switching to retrieval.',
    fractional: true,
  },
} as const
export type NumericKey = keyof typeof ATTACHMENT_NUMBERS
export type AttachmentDraft = Omit<AttachmentSettings, NumericKey> & Record<NumericKey, string | number>
export function attachmentFieldError(key: NumericKey, draft: AttachmentDraft): string {
  const field = ATTACHMENT_NUMBERS[key]
  const value = Number(draft[key])
  if (String(draft[key]).trim() === '') return 'Enter a value.'
  if (!Number.isFinite(value) || value < field.min || value > field.max)
    return `Enter a value from ${field.min} to ${field.max}.`
  if (!('fractional' in field) && !Number.isInteger(value)) return 'Enter a whole number.'
  if (key === 'overlap_chars' && value >= Number(draft.chunk_size_chars))
    return 'Chunk overlap must be smaller than chunk size.'
  return ''
}
