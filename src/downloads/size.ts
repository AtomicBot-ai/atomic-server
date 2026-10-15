// Lifted from atomic-chat-core/src/downloads/downloader.ts (`preflightSize`) @ 8a38521 (v0.17.0); adapted: a plain function over the request context, without stage events.
/** The size a download expects: the catalog's, or what a HEAD reports (`0` when neither is known). */

import { DOWNLOAD_CANCELLED } from './local.js'
import {
  classifyDownloadStatus,
  DownloadRequestError,
  HEAD_TIMEOUT_MS,
  MAX_STREAM_RETRIES,
  retryDelayMs,
} from './protocol.js'
import type { RequestContext } from './request.js'

export async function preflightSize(ctx: RequestContext, catalogSize?: number | null): Promise<number> {
  if (ctx.signal.aborted) throw new Error(DOWNLOAD_CANCELLED)
  if (catalogSize != null && catalogSize > 0) return catalogSize
  for (let retry = 0; ; retry++) {
    try {
      const res = await ctx.fetch(ctx.url, {
        method: 'HEAD',
        headers: ctx.headers,
        signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(HEAD_TIMEOUT_MS)]),
      })
      if (!res.ok) {
        const err = classifyDownloadStatus(res.status, '')
        err.message = `Failed to get file size: HTTP status ${res.status}`
        throw err
      }
      return Number(res.headers.get('content-length') ?? '0') || 0
    } catch (e) {
      if (ctx.signal.aborted) throw new Error(DOWNLOAD_CANCELLED)
      const retryable = !(e instanceof DownloadRequestError) || e.kind === 'retryable'
      if (retryable && retry < MAX_STREAM_RETRIES) {
        await ctx.sleep(retryDelayMs(retry, ctx.retryBaseMs), ctx.signal)
        continue
      }
      ctx.log('warn', `HEAD for '${ctx.url}' failed: ${(e as Error).message}. Continuing with unknown size`)
      return 0
    }
  }
}
