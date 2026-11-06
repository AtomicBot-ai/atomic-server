/**
 * What of atc's reports reaches Sentry. Since core 0.21.1 the core's reporter keeps only its own
 * diagnostic vocabulary and the codes it knows; atc names the tag keys it sets on its own reports
 * (`hostTagKeys`, core 0.21.3) and reads its own error codes here.
 */

import { errorCodeOf } from '@atomic-chat/core/host'
import { PROXY_CONFIG_INVALID } from '../downloads/index.js'
import { ATC_ERROR_CODES, AtcError } from '../errors/index.js'

/** Tag keys atc sets on its own reports, each with finite values: its part, the operation, its codes. */
export const ATC_REPORT_TAG_KEYS = [
  'component',
  'operation',
  'failure_reason',
  'native_failure',
  'diagnostic_code',
  'diagnostic_cause_code',
] as const

const ATC_CODES: ReadonlySet<string> = new Set<string>([...ATC_ERROR_CODES, PROXY_CONFIG_INVALID])
/** A Hub answer atc read as a failure: `HF_HTTP_<status>`. */
const HUB_STATUS = /^HF_HTTP_\d{3}$/

/** The code an atc report is tagged with: the core's when it knows it, else one of atc's own. */
export function reportCodeOf(error: unknown): string | undefined {
  const core = errorCodeOf(error)
  if (core) return core
  if (error instanceof AtcError) return error.code
  const code = (error as { code?: unknown } | null | undefined)?.code
  return typeof code === 'string' && (ATC_CODES.has(code) || HUB_STATUS.test(code)) ? code : undefined
}
