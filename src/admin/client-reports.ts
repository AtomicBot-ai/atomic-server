import { CLIENT_ERROR_NAMES, CLIENT_FAILURE_KINDS } from '../contract/index.js'
import type { ClientFailure } from '../contract/index.js'
import { AtcError } from '../errors/index.js'
import { captureFailure, type ErrorSink } from '../telemetry/index.js'

const FRAME = /^ {4}at (?:[\w.$<>]+ \()?\/assets\/[\w.-]+\.js:\d{1,9}:\d{1,9}\)?$/

/** An authenticated browser may submit technical locations, never free-form error text or data. */
export class ClientReports {
  private start: number
  private count = 0
  constructor(
    private sink: ErrorSink | undefined,
    private now: () => number = Date.now
  ) {
    this.start = now()
  }
  accept(raw: unknown): boolean {
    const body = raw as Partial<ClientFailure> | null
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => !['kind', 'name', 'frames'].includes(key)) ||
      !CLIENT_FAILURE_KINDS.includes(body.kind as ClientFailure['kind']) ||
      !CLIENT_ERROR_NAMES.includes(body.name as ClientFailure['name']) ||
      !Array.isArray(body.frames) ||
      body.frames.length > 30 ||
      !body.frames.every((line) => typeof line === 'string' && line.length <= 300 && FRAME.test(line))
    )
      throw new AtcError('ATC_USAGE', 'Invalid browser error report.')
    const now = this.now()
    if (now - this.start >= 60_000) {
      this.start = now
      this.count = 0
    }
    if (this.count >= 10) return false
    this.count++
    const message = `Browser ${body.kind} failure`
    const error =
      body.name === 'TypeError'
        ? new TypeError(message)
        : body.name === 'ReferenceError'
          ? new ReferenceError(message)
          : new Error(message)
    error.name = body.name ?? 'Error'
    error.stack = [`${error.name}: ${message}`, ...body.frames].join('\n')
    captureFailure(this.sink, error, { component: 'web-admin', operation: `browser.${body.kind}` })
    return true
  }
}
