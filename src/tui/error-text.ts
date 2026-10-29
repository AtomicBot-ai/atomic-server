import { errorBody } from '../errors/index.js'
/** An error on one line: the message and, when there is one, the hint. */
export function oneLine(error: unknown): string {
  const body = errorBody(error)
  return body.hint ? `${body.message} — ${body.hint}` : body.message
}
/** An error over several lines: its message, details and hint. */
export function explained(error: unknown): string {
  const body = errorBody(error)
  return [body.message, body.details, body.hint && `Hint: ${body.hint}`].filter(Boolean).join('\n')
}
