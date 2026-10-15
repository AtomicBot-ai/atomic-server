// Lifted from atomic-chat-core/src/downloads/downloader.ts @ 8a38521 (v0.17.0); adapted: progress goes to `snapshot()` and an `onProgress` callback instead of core events, a hash-pinned file of `minRangedBytes` and more comes over parallel ranges written in place (`ranges.ts`), and verification runs on the partial before it is renamed, so a cancel there keeps every byte.
/**
 * atc's model downloader. `save_path` is relative to the data folder and must stay inside it; the
 * partial is `<file>.tmp` beside `<file>.url` (and `<file>.ranges` for a ranged download), the same
 * sidecars the core and the desktop app write, so either can continue the other's partial. Preflight:
 * the Windows path limit and free space for what is left plus 512 MiB. After every file is complete
 * it is verified (size, sha256); a mismatch removes the file, a cancel keeps it for the resume.
 */

import { rename, rm, rmdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { checkFreeSpace, checkPathWithinLimit, remainingBytes } from './disk.js'
import {
  canonicalizeExistingPrefix,
  defaultAvailableSpace,
  defaultSleep,
  DOWNLOAD_CANCELLED,
  isInside,
  sidecars,
} from './local.js'
import { validateProxyConfig } from './protocol.js'
import type { ProxyConfig } from './protocol.js'
import { policyFetchFor } from './proxy-fetch.js'
import { downloadRanged, rangedBytes, readRangeState } from './ranges.js'
import { preflightSize } from './size.js'
import { downloadSingle, partialBytes } from './single.js'
import { defaultVerifyDeps, VALIDATION_CANCELLED_MESSAGE, verifyDownloadedFile } from './verify.js'
import type { VerifyDeps } from './verify.js'
import type { FileJob } from './request.js'

export { DOWNLOAD_CANCELLED } from './local.js'

export interface DownloadItem {
  url: string
  /** Relative to the data folder. */
  save_path: string
  sha256?: string | null
  size?: number | null
  proxy?: ProxyConfig | null
}
export interface DownloadOptions {
  headers?: Record<string, string>
  resume?: boolean
}
export interface DownloadProgress {
  taskId: string
  transferred: number
  total: number
  percent: number
}
export interface DownloaderDeps {
  dataFolder: string
  platform: NodeJS.Platform
  fetch: typeof fetch
  /** Parallel ranges for a hash-pinned file of `minRangedBytes` and more; `1` = always one stream. */
  streams?: number
  minRangedBytes?: number
  /** The fetch for one item; the seam for its proxy. */
  fetchFor?: (item: DownloadItem, base: typeof fetch) => typeof fetch
  /** Free bytes on the volume holding `path`, `undefined` when unknown. */
  availableSpace?: (path: string) => Promise<number | undefined>
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
  retryBaseMs?: number
  verify?: VerifyDeps
  onProgress?: (progress: DownloadProgress) => void
  log?: (level: 'info' | 'warn', message: string) => void
}

export const DEFAULT_STREAMS = 4
export const MIN_RANGED_BYTES = 32 * 1024 * 1024
/** `onProgress` fires at most once per this many new bytes (and at every file's end). */
const PROGRESS_STEP_BYTES = 1024 * 1024

interface Task {
  controller: AbortController
  progress: DownloadProgress
}

export class Downloader {
  private readonly tasks = new Map<string, Task>()
  constructor(private readonly deps: DownloaderDeps) {}

  /** Task ids running now. */
  active(): string[] {
    return [...this.tasks.keys()]
  }

  /** Every running task's progress: what a client that reconnects mid-transfer reads. */
  snapshot(): DownloadProgress[] {
    return [...this.tasks.values()].map((t) => ({ ...t.progress }))
  }

  /** Stop a running task. Partial and finished files stay for the resume. */
  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task) return false
    this.tasks.delete(taskId)
    task.controller.abort()
    return true
  }

  /** Download every item of `taskId`; a second call with the same id supersedes the first. */
  async download(taskId: string, items: DownloadItem[], options: DownloadOptions = {}): Promise<void> {
    this.tasks.get(taskId)?.controller.abort()
    const task: Task = {
      controller: new AbortController(),
      progress: { taskId, transferred: 0, total: 0, percent: 0 },
    }
    this.tasks.set(taskId, task)
    try {
      await this.run(task, items, options)
    } finally {
      if (this.tasks.get(taskId) === task) this.tasks.delete(taskId)
    }
  }

  private async run(task: Task, items: DownloadItem[], options: DownloadOptions): Promise<void> {
    const { dataFolder, platform } = this.deps
    const signal = task.controller.signal
    const resume = options.resume ?? false
    const headers = options.headers ?? {}
    const log = this.deps.log ?? (() => {})
    const sleep = this.deps.sleep ?? defaultSleep
    const retryBaseMs = this.deps.retryBaseMs ?? 1000
    const streams = this.deps.streams ?? DEFAULT_STREAMS
    const minRanged = this.deps.minRangedBytes ?? MIN_RANGED_BYTES
    for (const item of items) {
      const problem = item.proxy ? validateProxyConfig(item.proxy) : undefined
      if (problem) throw new Error(`Error: ${problem}`)
    }
    const fetchOf = (item: DownloadItem) => (this.deps.fetchFor ?? policyFetchFor)(item, this.deps.fetch)
    const sizes: number[] = []
    for (const item of items)
      sizes.push(
        await preflightSize(
          { fetch: fetchOf(item), url: item.url, headers, signal, sleep, retryBaseMs, log },
          item.size
        )
      )
    const total = sizes.reduce((a, b) => a + b, 0)
    const ranged = items.map((item, i) => streams > 1 && !!item.sha256 && (sizes[i] ?? 0) >= minRanged)

    const root = await canonicalizeExistingPrefix(dataFolder)
    const savePaths: string[] = []
    const partials: number[] = []
    for (const [i, item] of items.entries()) {
      const savePath = resolve(dataFolder, item.save_path)
      const limit = checkPathWithinLimit(savePath, platform)
      if (limit) throw new Error(limit)
      if (!isInside(await canonicalizeExistingPrefix(savePath), root))
        throw new Error(`Path ${savePath} is outside of the data folder ${dataFolder}`)
      savePaths.push(savePath)
      if (!resume) continue
      const state = ranged[i] ? await readRangeState(savePath, item.url, sizes[i] ?? 0) : undefined
      partials.push(state ? rangedBytes(state.ranges) : ((await partialBytes(savePath, item.url)) ?? 0))
    }
    const space = checkFreeSpace(
      await (this.deps.availableSpace ?? defaultAvailableSpace)(dataFolder),
      remainingBytes(total, partials)
    )
    if (space) throw new Error(space)

    const done = new Map<number, number>()
    let reported = -PROGRESS_STEP_BYTES
    const publish = (force: boolean) => {
      const transferred = [...done.values()].reduce((a, b) => a + b, 0)
      const percent = total > 0 ? Math.min(100, (transferred / total) * 100) : 0
      task.progress = { taskId: task.progress.taskId, transferred, total, percent }
      if (force || transferred - reported >= PROGRESS_STEP_BYTES) {
        reported = transferred
        this.deps.onProgress?.({ ...task.progress })
      }
    }
    // The first file that fails stops the others: none may keep writing once the task has ended.
    let failure: { error: unknown } | undefined
    const settled = await Promise.allSettled(
      items
        .map(async (item, i) => {
          const job: FileJob = {
            fetch: fetchOf(item),
            url: item.url,
            headers,
            signal,
            sleep,
            retryBaseMs,
            log,
            savePath: savePaths[i] as string,
            size: sizes[i] ?? 0,
            resume,
            report: (bytes) => {
              done.set(i, bytes)
              publish(false)
            },
          }
          if (ranged[i]) {
            const outcome = await downloadRanged(job, streams)
            if (outcome.kind === 'single') await downloadSingle({ ...job, resume: false }, outcome.initial)
          } else await downloadSingle(job)
          publish(true)
        })
        .map((work) =>
          work.catch((error: unknown) => {
            if (!signal.aborted) {
              failure ??= { error }
              task.controller.abort()
            }
            throw error
          })
        )
    )
    if (failure) throw failure.error
    const rejected = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (rejected) throw rejected.reason

    const verify = this.deps.verify ?? defaultVerifyDeps
    for (const [i, item] of items.entries()) {
      const savePath = savePaths[i] as string
      const s = sidecars(savePath)
      try {
        await verifyDownloadedFile(item, s.tmp, verify, signal)
      } catch (e) {
        if (signal.aborted || (e as Error).message === VALIDATION_CANCELLED_MESSAGE)
          throw new Error(DOWNLOAD_CANCELLED)
        log('warn', `Validation failed (${(e as Error).message}); removing ${savePath}`)
        for (const path of Object.values(s)) await rm(path, { force: true }).catch(() => {})
        await rmdir(dirname(savePath)).catch(() => {})
        throw e
      }
    }
    // Past verification nothing is cancelled: renaming and dropping the sidecars leaves no half state.
    for (const savePath of savePaths) {
      const s = sidecars(savePath)
      await rename(s.tmp, savePath)
      await rm(s.ranges, { force: true }).catch(() => {})
      await rm(s.url, { force: true }).catch(() => {})
      log('info', `Finished downloading ${savePath}`)
    }
    publish(true)
  }
}
