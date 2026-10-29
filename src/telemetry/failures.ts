import { AtomicCoreError } from '@atomic-chat/core'
import { errorCodeOf, isCancellation } from '@atomic-chat/core/host'
import type { ErrorReport, ErrorSink } from '@atomic-chat/core/host'
import { AtcError, isRemoteError, markReported, wasReported } from '../errors/index.js'
import { CLIENT_ERROR_NAMES } from '../contract/index.js'

const OPERATIONAL = new Set([
  'ATC_INTERNAL',
  'ATC_CONFIG_MIGRATION_FAILED',
  'ATC_CHECKSUM_MISMATCH',
  'ATC_UPDATE_FAILED',
  'ATC_SERVICE_FAILED',
])

/** Typed expected refusals stay local; a code alone does not make a failure expected. */
export function expectedFailure(error: unknown): boolean {
  return (
    isRemoteError(error) ||
    wasReported(error) ||
    error instanceof AtomicCoreError ||
    isCancellation(error) ||
    (error instanceof AtcError && !OPERATIONAL.has(error.code))
  )
}

export interface FailureContext {
  component: string
  operation: string
}

/** Free-form messages can quote prompts or replies. New boundaries retain only code and call frames. */
export function technicalError(error: unknown, operation: string): Error {
  const safe = new Error(`Unexpected failure in ${operation}`)
  safe.name =
    error instanceof Error && CLIENT_ERROR_NAMES.some((name) => name === error.name) ? error.name : 'Error'
  const frames =
    error instanceof Error
      ? error.stack
          ?.split('\n')
          .slice(1)
          .filter((line) => /^\s+at /.test(line))
          .slice(0, 30)
      : undefined
  safe.stack = [`${safe.name}: ${safe.message}`, ...(frames ?? [])].join('\n')
  return safe
}

export function failureReport(error: unknown, context: FailureContext): ErrorReport | null {
  if (expectedFailure(error)) return null
  return {
    source: 'event_listener',
    level: 'error',
    error: technicalError(error, context.operation),
    tags: { ...context, error_code: errorCodeOf(error) },
  }
}

/** A local failure belongs to its first reporting boundary, including when a parent catches it. */
export function captureFailure(sink: ErrorSink | undefined, error: unknown, context: FailureContext): void {
  if (!sink) return
  const report = failureReport(error, context)
  if (!report) return
  markReported(error)
  try {
    sink.capture(report)
  } catch {
    /* Reporting must never change the operation's result. */
  }
}
