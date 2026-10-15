/**
 * One large, hash-pinned file over parallel byte ranges, each written at its own offset in the one
 * `<file>.tmp`: no parts to join, so the disk never holds more than the file. Where each range has
 * reached is kept in `<file>.ranges` (written atomically, after the bytes it claims are synced), so a
 * cancelled or interrupted download continues every range from its own byte. A server that answers
 * the first range with a full body gets the download over one stream instead.
 */

import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DOWNLOAD_CANCELLED, diskError, isFinalError, sidecars } from './local.js'
import { MAX_STREAM_RETRIES, RETRY_RESET_PROGRESS_BYTES, retryDelayMs } from './protocol.js'
import { plainError, requestWithRetry } from './request.js'
import type { FileJob } from './request.js'
import { partialBytes } from './single.js'

export interface ByteSpan {
  start: number
  /** Inclusive. */
  end: number
  /** The next byte to write; `end + 1` when the span is complete. */
  next: number
}
export interface RangeState {
  url: string
  size: number
  ranges: ByteSpan[]
}
export type RangedOutcome = { kind: 'done' } | { kind: 'single'; initial?: Response }

/** Sync and record progress after this many bytes have arrived since the last record. */
export const PERSIST_EVERY_BYTES = 8 * 1024 * 1024

/** `[0, prefix)` as one finished span, the rest in up to `streams` equal spans. */
export function planRanges(size: number, streams: number, prefix = 0): ByteSpan[] {
  const out: ByteSpan[] = prefix > 0 ? [{ start: 0, end: prefix - 1, next: prefix }] : []
  const rest = size - prefix
  if (rest <= 0) return out
  const step = Math.ceil(rest / Math.max(1, Math.min(streams, rest)))
  for (let start = prefix; start < size; start += step)
    out.push({ start, end: Math.min(size, start + step) - 1, next: start })
  return out
}

export const rangedBytes = (ranges: readonly ByteSpan[]): number =>
  ranges.reduce((sum, r) => sum + (r.next - r.start), 0)

/** The recorded ranges of this URL and size, when they and the partial they describe are intact. */
export async function readRangeState(savePath: string, url: string, size: number) {
  const s = sidecars(savePath)
  if ((await partialBytes(savePath, url)) === undefined) return undefined
  const raw = await readFile(s.ranges, 'utf8').catch(() => undefined)
  if (raw === undefined) return undefined
  try {
    const state = JSON.parse(raw) as RangeState
    if (state.url !== url || state.size !== size || !Array.isArray(state.ranges) || !state.ranges.length)
      return undefined
    let expect = 0
    for (const r of state.ranges) {
      if (![r.start, r.end, r.next].every(Number.isSafeInteger)) return undefined
      if (r.start !== expect || r.end < r.start || r.next < r.start || r.next > r.end + 1) return undefined
      expect = r.end + 1
    }
    return expect === size ? state : undefined
  } catch {
    return undefined
  }
}

async function record(savePath: string, state: RangeState): Promise<void> {
  const s = sidecars(savePath)
  await writeFile(s.rangesNext, JSON.stringify(state)).catch((e) => {
    throw diskError(e)
  })
  await rename(s.rangesNext, s.ranges).catch((e) => {
    throw diskError(e)
  })
}

export async function downloadRanged(job: FileJob, streams: number): Promise<RangedOutcome> {
  const s = sidecars(job.savePath)
  await mkdir(dirname(job.savePath), { recursive: true }).catch((e) => {
    throw diskError(e)
  })
  let state = job.resume ? await readRangeState(job.savePath, job.url, job.size) : undefined
  let fresh = false
  if (!state) {
    // A one-stream partial of this URL (this downloader's, or an earlier client's) keeps its bytes.
    const hasRanges = await stat(s.ranges).then(
      () => true,
      () => false
    )
    const prefix = job.resume && !hasRanges ? await partialBytes(job.savePath, job.url) : undefined
    fresh = !(prefix !== undefined && prefix > 0 && prefix <= job.size)
    state = { url: job.url, size: job.size, ranges: planRanges(job.size, streams, fresh ? 0 : prefix) }
    if (fresh) await rm(s.tmp, { force: true })
  }
  await rm(s.rangesNext, { force: true })
  await writeFile(s.url, job.url).catch((e) => {
    throw diskError(e)
  })
  await record(job.savePath, state)
  const ranges = state.ranges
  job.report(rangedBytes(ranges))
  const pending = ranges.filter((r) => r.next <= r.end)
  if (!pending.length) return { kind: 'done' }

  const handle = await open(s.tmp, fresh ? 'w+' : 'r+').catch((e) => {
    throw diskError(e)
  })
  const inner = new AbortController()
  const ctx = { ...job, signal: AbortSignal.any([job.signal, inner.signal]) }
  let saving = Promise.resolve()
  let unsaved = 0
  const save = () => {
    const snapshot: RangeState = { ...state, ranges: ranges.map((r) => ({ ...r })) }
    saving = saving.then(async () => {
      await handle.datasync()
      await record(job.savePath, snapshot)
    })
    return saving
  }

  const worker = async (span: ByteSpan, initial?: Response) => {
    let res = initial
    let retries = 0
    let sinceReset = 0
    for (;;) {
      res ??= await requestWithRetry(ctx, { start: span.next, end: span.end, size: job.size }).catch((e) => {
        throw plainError(e)
      })
      let streamError: string | undefined
      const reader = res.body?.getReader()
      try {
        while (reader && span.next <= span.end) {
          const { done, value } = await reader.read()
          if (done) break
          if (ctx.signal.aborted) throw new Error(DOWNLOAD_CANCELLED)
          const take = Math.min(value.byteLength, span.end + 1 - span.next)
          await handle.write(value, 0, take, span.next).catch((e) => {
            throw diskError(e)
          })
          span.next += take
          sinceReset += take
          if (sinceReset >= RETRY_RESET_PROGRESS_BYTES) {
            retries = 0
            sinceReset = 0
          }
          job.report(rangedBytes(ranges))
          unsaved += take
          if (unsaved >= PERSIST_EVERY_BYTES) {
            unsaved = 0
            void save().catch(() => {})
          }
        }
      } catch (e) {
        if (isFinalError(e)) throw e
        if (ctx.signal.aborted) throw new Error(DOWNLOAD_CANCELLED)
        streamError = (e as Error).message
      } finally {
        await reader?.cancel().catch(() => {})
      }
      if (span.next > span.end) return
      streamError ??= `range ended at byte ${span.next} of ${span.end + 1}`
      if (retries >= MAX_STREAM_RETRIES)
        throw new Error(
          `Download failed after ${MAX_STREAM_RETRIES} retries at byte ${span.next}: ${streamError}`
        )
      if (ctx.signal.aborted) throw new Error(DOWNLOAD_CANCELLED)
      job.log(
        'warn',
        `Range of '${job.url}' broke at byte ${span.next}: ${streamError}. Retry ${retries + 1}`
      )
      await job.sleep(retryDelayMs(retries, job.retryBaseMs), ctx.signal)
      retries++
      res = undefined
    }
  }

  let fallback: Extract<RangedOutcome, { kind: 'single' }> | undefined
  const outcomes: PromiseSettledResult<void>[] = []
  try {
    const [first, ...rest] = pending as [ByteSpan, ...ByteSpan[]]
    // The first range alone: its answer says whether this server serves ranges at all.
    const probe = await requestWithRetry(ctx, {
      start: first.next,
      end: first.end,
      size: job.size,
      acceptFull: true,
    }).catch((e) => {
      throw plainError(e)
    })
    if (probe.status === 200) {
      const untouched = rangedBytes(ranges) === 0
      if (!untouched) await probe.body?.cancel().catch(() => {})
      fallback = { kind: 'single', ...(untouched ? { initial: probe } : {}) }
    } else {
      const fail = (e: unknown) => {
        inner.abort()
        throw e
      }
      outcomes.push(
        ...(await Promise.allSettled([
          worker(first, probe).catch(fail),
          ...rest.map((span) => worker(span).catch(fail)),
        ]))
      )
    }
  } finally {
    await saving.catch(() => {})
    if (!fallback) await save().catch(() => {})
    await handle.close().catch(() => {})
  }
  if (fallback) {
    job.log('info', `'${job.url}' is not served in ranges; downloading it over one stream`)
    await rm(s.ranges, { force: true })
    if (!fallback.initial) await rm(s.tmp, { force: true })
    return fallback
  }
  const failed = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected')
  if (job.signal.aborted) throw new Error(DOWNLOAD_CANCELLED)
  const cause = failed.find((f) => (f.reason as Error).message !== DOWNLOAD_CANCELLED) ?? failed[0]
  if (cause) throw cause.reason
  return { kind: 'done' }
}
