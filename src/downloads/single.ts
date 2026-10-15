// Lifted from atomic-chat-core/src/downloads/downloader.ts (`downloadOne`) @ 8a38521 (v0.17.0); adapted: stops at a complete `.tmp` (the downloader verifies, then renames), writes through one file handle that every exit closes, and can start from a response a range probe already holds.
/**
 * One file over one stream into `<file>.tmp`: resume from the partial when its `.url` matches,
 * reconnect at the byte reached after a dropped stream (5 retries per stall, reset by 1 MiB of
 * progress), restart from 0 when the server cannot resume.
 */

import { mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DOWNLOAD_CANCELLED, diskError, isFinalError, sidecars } from './local.js'
import {
  DownloadRequestError,
  MAX_STREAM_RETRIES,
  RETRY_RESET_PROGRESS_BYTES,
  retryDelayMs,
} from './protocol.js'
import { plainError, requestBytes, requestWithRetry } from './request.js'
import type { FileJob } from './request.js'

/** Bytes in the partial when it belongs to this URL, `undefined` otherwise. */
export async function partialBytes(savePath: string, url: string): Promise<number | undefined> {
  const s = sidecars(savePath)
  const same = await readFile(s.url, 'utf8').then(
    (u) => u === url,
    () => false
  )
  if (!same) return undefined
  return stat(s.tmp).then(
    (st) => st.size,
    () => undefined
  )
}

export async function downloadSingle(job: FileJob, initial?: Response): Promise<void> {
  const s = sidecars(job.savePath)
  await mkdir(dirname(job.savePath), { recursive: true }).catch((e) => {
    throw diskError(e)
  })
  let from = 0
  if (!initial && job.resume) {
    const have = await partialBytes(job.savePath, job.url)
    if (have !== undefined && job.size > 0 && have === job.size) {
      job.report(have)
      return
    }
    if (have !== undefined && !(job.size > 0 && have > job.size)) from = have
  }
  await rm(s.ranges, { force: true })
  await rm(s.rangesNext, { force: true })
  await writeFile(s.url, job.url).catch((e) => {
    throw diskError(e)
  })
  let res: Response
  if (initial) res = initial
  else {
    try {
      res = await requestWithRetry(job, { start: from, size: job.size })
    } catch (e) {
      if (!(e instanceof DownloadRequestError && e.kind === 'restart')) throw plainError(e)
      job.log('warn', `Resume is unavailable for '${job.url}': ${e.message}`)
      from = 0
      res = await requestWithRetry(job, { start: 0, size: job.size }).catch((e2: unknown) => {
        throw plainError(e2)
      })
    }
  }
  // Append mode, so a later truncate(0) (a server that cannot resume) puts the next byte at 0.
  if (from === 0)
    await writeFile(s.tmp, new Uint8Array()).catch((e) => {
      throw diskError(e)
    })
  const handle = await open(s.tmp, 'a').catch((e) => {
    throw diskError(e)
  })
  let written = from
  try {
    job.report(written)
    written = await pump(job, handle, res, written)
  } finally {
    await handle.close().catch(() => {})
  }
  const persisted = (
    await stat(s.tmp).catch((e) => {
      throw diskError(e)
    })
  ).size
  if (persisted !== written)
    throw new Error(
      `Downloaded file size mismatch for '${job.url}': tracked ${written} bytes but persisted ${persisted} bytes`
    )
  if (job.size > 0 && persisted !== job.size)
    throw new Error(
      `Incomplete download for '${job.url}': expected ${job.size} bytes but received ${persisted} bytes; partial file was kept for resume`
    )
}

/** Stream `res` into the partial, reconnecting at the byte reached; returns the bytes on disk. */
async function pump(job: FileJob, handle: FileHandle, first: Response, from: number): Promise<number> {
  let res = first
  let written = from
  let retries = 0
  let sinceReset = 0
  for (;;) {
    let streamError: string | undefined
    const reader = res.body?.getReader()
    try {
      for (;;) {
        if (!reader) break
        const { done, value } = await reader.read()
        if (done) break
        if (job.signal.aborted) throw new Error(DOWNLOAD_CANCELLED)
        await handle.write(value).catch((e) => {
          throw diskError(e)
        })
        written += value.byteLength
        sinceReset += value.byteLength
        if (sinceReset >= RETRY_RESET_PROGRESS_BYTES) {
          retries = 0
          sinceReset = 0
        }
        job.report(written)
      }
    } catch (e) {
      if (isFinalError(e)) throw e
      if (job.signal.aborted) throw new Error(DOWNLOAD_CANCELLED)
      streamError = (e as Error).message
    } finally {
      await reader?.cancel().catch(() => {})
    }
    if (streamError === undefined) {
      if (job.size > 0 && written < job.size)
        streamError = `stream ended after ${written} of ${job.size} bytes`
      else return written
    }
    for (;;) {
      if (retries >= MAX_STREAM_RETRIES)
        throw new Error(
          `Download failed after ${MAX_STREAM_RETRIES} retries at byte ${written}: ${streamError}`
        )
      if (job.signal.aborted) throw new Error(DOWNLOAD_CANCELLED)
      job.log(
        'warn',
        `Stream error at byte ${written} for '${job.url}': ${streamError}. Retry ${retries + 1}`
      )
      await job.sleep(retryDelayMs(retries, job.retryBaseMs), job.signal)
      retries++
      try {
        res = await requestBytes(job, { start: written, size: job.size })
        break
      } catch (e) {
        if (e instanceof DownloadRequestError && e.kind === 'restart') {
          try {
            res = await requestBytes(job, { start: 0, size: job.size })
          } catch (e2) {
            if (e2 instanceof DownloadRequestError && e2.kind === 'retryable') continue
            throw plainError(e2)
          }
          await handle.truncate(0).catch((e3) => {
            throw diskError(e3)
          })
          written = 0
          sinceReset = 0
          job.report(0)
          job.log('warn', `Server cannot resume '${job.url}' (${e.message}); restarted from byte 0`)
          break
        }
        if (e instanceof DownloadRequestError && e.kind === 'retryable') continue
        throw plainError(e)
      }
    }
  }
}
