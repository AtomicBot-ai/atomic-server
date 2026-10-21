/**
 * What a failure in atc's own server code becomes as a report — or null when it is an answer, not a
 * defect. Pure. The core's sources are reused (`startup`, `control_route`, `model_load`) and the
 * `component` tag says which part of atc it came from.
 */

import {
  errorCodeOf,
  internalErrorReport,
  isCancellation,
  processFailureReport,
} from '@atomic-chat/core/host'
import type { ErrorReport, ReportLevel } from '@atomic-chat/core/host'
import {
  DOWNLOAD_CANCELLED,
  DownloadRequestError,
  HASH_MISMATCH_MESSAGE,
  PROXY_CONFIG_INVALID,
  VALIDATION_CANCELLED_MESSAGE,
} from '../downloads/index.js'
import { AtcError } from '../errors/index.js'

/** An `AtcError` is an answer atc gives on purpose, unless it says atc itself is broken. */
function isAnswer(error: unknown): boolean {
  return error instanceof AtcError && error.code !== 'ATC_INTERNAL'
}

/** The server could not start. Ports in use and an owner already running are answers. */
export function startupFailureReport(error: unknown): ErrorReport | null {
  if (isAnswer(error)) return null
  const report = processFailureReport('startup', error)
  return report && { ...report, tags: { ...report.tags, component: 'daemon' } }
}

const ROUTE_WORD = /^[a-z][a-z_-]{0,31}$/
const ROUTE_DEPTH = 4

/** `METHOD /api/…` with every segment that is not a plain word (an id, a model) as `:id`. */
export function adminRoute(method: string, path: string): string {
  const segments = (path.split('?')[0] ?? '')
    .split('/')
    .filter(Boolean)
    .slice(0, ROUTE_DEPTH)
    .map((s) => (ROUTE_WORD.test(s) ? s : ':id'))
  return `${method} /${segments.join('/')}`
}

/**
 * A request the admin API failed on its side. atc's own answers, the core's (it reports its own),
 * clients that hung up and anything under 500 are left out.
 */
export function adminFailureReport(input: {
  error: unknown
  status: number
  method: string
  path: string
}): ErrorReport | null {
  if (isAnswer(input.error)) return null
  const report = internalErrorReport({
    source: 'control_route',
    error: input.error,
    status: input.status,
    route: adminRoute(input.method, input.path),
  })
  return report && { ...report, tags: { ...report.tags, component: 'admin' } }
}

export type DownloadFailureReason =
  | 'cancelled'
  | 'http_401_auth'
  | 'http_404'
  | 'http_5xx'
  | 'http_other'
  | 'checksum_mismatch'
  | 'size_mismatch'
  | 'proxy'
  | 'proxy_config'
  | 'network'
  | 'path_guard'
  | 'unknown'
  | `disk_${string}`

const NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
])

/**
 * Why a model download failed. Typed facts first (an HTTP status, an error code, the downloader's
 * exported messages and disk tags); free text only for what nothing types (a dropped stream).
 */
export function downloadFailureReason(error: unknown): DownloadFailureReason {
  const message = error instanceof Error ? error.message : String(error)
  const code = errorCodeOf(error) ?? errorCodeOf((error as { cause?: unknown } | undefined)?.cause)
  // Not `isClientAbort`: a reset connection is the network failing a download, not a client leaving.
  if (message === DOWNLOAD_CANCELLED || message === VALIDATION_CANCELLED_MESSAGE || isCancellation(error))
    return 'cancelled'
  if (code === PROXY_CONFIG_INVALID) return 'proxy_config'
  const disk = /^Error: \[(disk_[a-z_]+)\]/.exec(message)
  if (disk?.[1]) return disk[1] as DownloadFailureReason
  const status = httpStatusOf(error)
  if (status === 401 || status === 403) return 'http_401_auth'
  if (status === 404) return 'http_404'
  if (status !== undefined) return status >= 500 ? 'http_5xx' : 'http_other'
  if (message === HASH_MISMATCH_MESSAGE) return 'checksum_mismatch'
  if (message.startsWith('Size verification failed')) return 'size_mismatch'
  if (message.includes('outside of the data folder')) return 'path_guard'
  if ((error as Error | undefined)?.name === 'ProxyTunnelError') return 'proxy'
  if (
    (code && NETWORK_CODES.has(code)) ||
    message === 'fetch failed' ||
    message.startsWith('Download failed after')
  )
    return 'network'
  return 'unknown'
}

/** The status a server answered with: typed on `DownloadRequestError`, else read from the message. */
function httpStatusOf(error: unknown): number | undefined {
  if (error instanceof DownloadRequestError && error.status !== undefined) return error.status
  const match = /HTTP status (\d{3})/.exec(error instanceof Error ? error.message : String(error))
  return match?.[1] ? Number(match[1]) : undefined
}

/** Fixed by the person (a token, free space) or by stopping: nothing for an issue. */
const NOT_REPORTED: ReadonlySet<DownloadFailureReason> = new Set([
  'cancelled',
  'http_401_auth',
  'disk_full',
  'proxy_config',
])
/** Their machine or network rather than our code: counted, at `warning`. */
const ENVIRONMENT = (reason: DownloadFailureReason) =>
  reason === 'network' || reason === 'proxy' || reason === 'http_5xx' || reason.startsWith('disk_')

/** A model download that failed: one issue per known cause, an unknown one grouped by its stack. */
export function downloadFailureReport(error: unknown): ErrorReport | null {
  const reason = downloadFailureReason(error)
  if (NOT_REPORTED.has(reason)) return null
  const level: ReportLevel = ENVIRONMENT(reason) ? 'warning' : 'error'
  return {
    source: 'model_load',
    level,
    error,
    ...(reason === 'unknown' ? {} : { fingerprint: ['download-failure', reason] }),
    tags: {
      component: 'downloads',
      failure_reason: reason,
      http_status: httpStatusOf(error),
      error_code: errorCodeOf(error),
    },
  }
}
