/** A response (or unavailable connection) owned by the server, displayed without a second report. */
export class AdminApiError extends Error {
  readonly code: string
  /** The HTTP status, or 0 when the request never got an answer. */
  readonly status: number
  readonly details?: string
  readonly hint?: string
  constructor(
    code: string,
    message: string,
    options: { status?: number; details?: string; hint?: string } = {}
  ) {
    super(message)
    this.name = 'AdminApiError'
    this.code = code
    this.status = options.status ?? 0
    this.details = options.details
    this.hint = options.hint
  }
}
