/** Only code-owned categories and bundled asset locations cross the browser reporting boundary. */
export const CLIENT_FAILURE_KINDS = ['error', 'unhandled_rejection', 'react', 'action'] as const
export const CLIENT_ERROR_NAMES = [
  'Error',
  'TypeError',
  'ReferenceError',
  'RangeError',
  'SyntaxError',
  'URIError',
  'EvalError',
] as const
export type ClientFailureKind = (typeof CLIENT_FAILURE_KINDS)[number]
export interface ClientFailure {
  kind: ClientFailureKind
  name: (typeof CLIENT_ERROR_NAMES)[number]
  frames: string[]
}
