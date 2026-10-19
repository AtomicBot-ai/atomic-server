/** One HTTP request of a download, with the retry ladder: open ranges, bounded ranges and full bodies. */

import { DOWNLOAD_CANCELLED } from './local.js'
import {
  classifyDownloadStatus,
  classifyResumeStatus,
  DownloadRequestError,
  MAX_STREAM_RETRIES,
  retryDelayMs,
  validateContentRange,
} from './protocol.js'

export interface RequestContext {
  fetch: typeof fetch
  url: string
  headers: Record<string, string>
  signal: AbortSignal
  sleep: (ms: number, signal: AbortSignal) => Promise<void>
  retryBaseMs: number
  log: (level: 'info' | 'warn', message: string) => void
}

export interface ByteRange {
  start: number
  /** Inclusive; absent for "to the end". */
  end?: number
  /** The file size the caller expects, `0` when unknown. */
  size: number
  /** A 200 answer to a range is returned as is instead of failing as `restart`. */
  acceptFull?: boolean
}

/** GET `url`, from `range.start` when it is past 0 or bounded. Statuses are classified, not retried. */
export async function requestBytes(ctx: RequestContext, range: ByteRange): Promise<Response> {
  const ranged = range.start > 0 || range.end !== undefined
  const headers = ranged ? { ...ctx.headers, Range: `bytes=${range.start}-${range.end ?? ''}` } : ctx.headers
  let res: Response
  try {
    res = await ctx.fetch(ctx.url, { headers, signal: ctx.signal })
  } catch (e) {
    if (ctx.signal.aborted) throw new Error(DOWNLOAD_CANCELLED)
    throw new DownloadRequestError('retryable', (e as Error).message)
  }
  if (!ranged) {
    if (!res.ok) throw classifyDownloadStatus(res.status, await res.text().catch(() => ''))
    return res
  }
  if (res.status === 206) {
    try {
      validateContentRange(res.headers.get('content-range'), range.start, range.size)
    } catch (e) {
      await res.body?.cancel().catch(() => {})
      throw e
    }
    return res
  }
  if (res.status === 200 && range.acceptFull) return res
  const body =
    res.status === 200 || res.status === 416 || (res.status >= 500 && res.status < 600)
      ? ''
      : await res.text().catch(() => '')
  await res.body?.cancel().catch(() => {})
  throw classifyResumeStatus(res.status, body)
}

/** `requestBytes`, retrying what is worth retrying with exponential backoff. */
export async function requestWithRetry(ctx: RequestContext, range: ByteRange): Promise<Response> {
  for (let retry = 0; ; retry++) {
    try {
      return await requestBytes(ctx, range)
    } catch (e) {
      if (!(e instanceof DownloadRequestError) || e.kind !== 'retryable' || retry >= MAX_STREAM_RETRIES)
        throw e
      if (ctx.signal.aborted) throw new Error(DOWNLOAD_CANCELLED)
      ctx.log(
        'warn',
        `Request for '${ctx.url}' failed: ${e.message}. Retry ${retry + 1}/${MAX_STREAM_RETRIES}`
      )
      await ctx.sleep(retryDelayMs(retry, ctx.retryBaseMs), ctx.signal)
    }
  }
}

/** Request errors reach the caller as plain `Error`s. */
export function plainError(e: unknown): Error {
  if (e instanceof DownloadRequestError) return new Error(e.message)
  return e instanceof Error ? e : new Error(String(e))
}

/** One file of a download, as the single-stream and the ranged writers see it. */
export interface FileJob extends RequestContext {
  /** Absolute; the partial is `<savePath>.tmp` until the downloader verifies and renames it. */
  savePath: string
  /** Bytes to expect, `0` when unknown. */
  size: number
  resume: boolean
  /** Bytes of this file on disk now. */
  report: (bytes: number) => void
}
