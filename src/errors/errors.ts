/**
 * Every failure a command can end with, and how it turns into an exit code and a message. The
 * core's `AtomicCoreError` passes through unchanged (same codes, same rendering as the core's CLI);
 * `AtcError` adds the codes that belong to `atc` itself.
 */

import { AtomicCoreError } from '@atomic-chat/core'

export const ATC_ERROR_CODES = [
  'ATC_NOT_IMPLEMENTED',
  'ATC_USAGE',
  'ATC_CONFIG_INVALID',
  'ATC_CONFIG_MIGRATION_FAILED',
  'ATC_DAEMON_NOT_RUNNING',
  'ATC_DAEMON_ALREADY_RUNNING',
  'ATC_DAEMON_FOREIGN',
  'ATC_DAEMON_OUTDATED',
  'ATC_DAEMON_START_FAILED',
  'ATC_ADMIN_BIND_FAILED',
  'ATC_PORT_BUSY',
  'ATC_ADMIN_UNAUTHORIZED',
  'ATC_CONSENT_REQUIRED',
  'ATC_ELEVATION_REQUIRED',
  'ATC_UNSUPPORTED_PLATFORM',
  'ATC_SERVICE_NOT_INSTALLED',
  'ATC_SERVICE_FAILED',
  'ATC_UPDATE_FAILED',
  'ATC_CHECKSUM_MISMATCH',
  'ATC_INTERNAL',
] as const
export type AtcErrorCode = (typeof ATC_ERROR_CODES)[number]

export class AtcError extends Error {
  readonly code: AtcErrorCode
  readonly details: string | undefined
  readonly hint: string | undefined

  constructor(code: AtcErrorCode, message: string, options: { details?: string; hint?: string } = {}) {
    super(message)
    this.name = 'AtcError'
    this.code = code
    this.details = options.details
    this.hint = options.hint
  }
}

/** Process exit codes. 2 for usage mirrors the core's CLI; 3 marks a scaffold stub. */
export const EXIT = {
  OK: 0,
  ERROR: 1,
  USAGE: 2,
  NOT_IMPLEMENTED: 3,
  INTERRUPTED: 130,
} as const

export interface ErrorBody {
  code: string
  message: string
  details?: string
  hint?: string
}

export function errorBody(error: unknown): ErrorBody {
  if (error instanceof AtcError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
      ...(error.hint !== undefined ? { hint: error.hint } : {}),
    }
  }
  if (error instanceof AtomicCoreError) {
    return {
      code: error.code,
      message: atcCommands(error.message),
      ...(error.details !== undefined ? { details: atcCommands(error.details) } : {}),
    }
  }
  if (error instanceof Error) return { code: 'ATC_INTERNAL', message: error.message }
  return { code: 'ATC_INTERNAL', message: String(error) }
}

/** The core names its own command in a hint (`atomic-chat-cli models list`); here the command is `atc`. */
export function atcCommands(text: string): string {
  // Only a command (`atomic-chat-cli <word>`): the default data folder is named after that CLI too.
  return text.replace(/atomic-chat-cli serve\b/g, 'atc run').replace(/atomic-chat-cli(?= [a-z])/g, 'atc')
}

export function exitCodeFor(error: unknown): number {
  if (error instanceof AtcError) {
    if (error.code === 'ATC_USAGE') return EXIT.USAGE
    if (error.code === 'ATC_NOT_IMPLEMENTED') return EXIT.NOT_IMPLEMENTED
  }
  return EXIT.ERROR
}

/** The human rendering: `message`, an indented `details` line with the code, then the hint. */
export function describeError(error: unknown): string {
  const body = errorBody(error)
  const lines = [body.message]
  lines.push(body.details !== undefined ? `  ${body.details} [${body.code}]` : `  [${body.code}]`)
  if (body.hint !== undefined) lines.push(`  hint: ${body.hint}`)
  return lines.join('\n')
}
