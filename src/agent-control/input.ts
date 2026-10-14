import { AtcError } from '../errors/index.js'
/** Parse one object without accepting arrays or executable command text. */
export function parseControlInput(text: string): Record<string, unknown> {
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    throw new AtcError('ATC_USAGE', 'Input must be valid JSON.', {
      hint: 'Use --input @file.json for a saved request.',
    })
  }
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new AtcError('ATC_USAGE', 'Input must be a JSON object.')
  return input as Record<string, unknown>
}
