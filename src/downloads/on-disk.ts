/**
 * What a download left on disk, for a job nobody runs (the server restarted mid-way): the bytes every
 * recorded range reached, else the single-stream partial's size, else the finished file's; `0` when the
 * partial belongs to another URL or there is none. The Downloads list shows these instead of 0 B.
 */

import { resolve } from 'node:path'
import type { DownloadItem } from './downloader.js'
import { defaultVerifyDeps, verifiedCopy } from './verify.js'
import { lstat, stat } from 'node:fs/promises'
import { rangedBytes, readRangeState } from './ranges.js'
import { canonicalizeExistingPrefix, isInside, sidecars } from './local.js'
import { partialBytes } from './single.js'

export async function bytesOnDisk(savePath: string, url: string, size: number): Promise<number> {
  const ranges = await readRangeState(savePath, url, size).catch(() => undefined)
  if (ranges) return rangedBytes(ranges.ranges)
  const partial = await partialBytes(savePath, url)
  if (partial !== undefined) return partial
  return stat(savePath).then(
    (s) => s.size,
    () => 0
  )
}

/** Bytes a transfer can reuse for this pinned source, excluding untracked sparse extents. */
export async function reusablePartial(savePath: string, identity: string, size: number, ranged: boolean) {
  const partial = await partialBytes(savePath, identity)
  if (partial === undefined || partial > size) return 0
  const paths = sidecars(savePath)
  const regular = await lstat(paths.tmp).then(
    (stat) => stat.isFile(),
    () => false
  )
  if (!regular) return 0
  const state = ranged ? await readRangeState(savePath, identity, size) : undefined
  if (state && state.ranges.every((range) => range.next === range.start || range.next <= partial))
    return rangedBytes(state.ranges)
  const noRangeFile = await lstat(paths.ranges).then(
    () => false,
    (error: NodeJS.ErrnoException) => error.code === 'ENOENT'
  )
  return noRangeFile ? partial : 0
}

export const DEFAULT_STREAMS = 4
export const MIN_RANGED_BYTES = 32 * 1024 * 1024

export function usesRanges(
  item: DownloadItem,
  size: number,
  streams = DEFAULT_STREAMS,
  min = MIN_RANGED_BYTES
) {
  return streams > 1 && !!item.sha256 && size >= min
}

/** Count completed files and partials reusable by the workspace's default downloader. */
export async function stagedDownloadBytes(
  items: readonly DownloadItem[],
  dataFolder: string,
  signal: AbortSignal
): Promise<number> {
  const root = await canonicalizeExistingPrefix(dataFolder)
  let total = 0
  for (const item of items) {
    signal.throwIfAborted()
    if (!item.size || !item.sha256) continue
    const path = resolve(dataFolder, item.save_path)
    if (!isInside(await canonicalizeExistingPrefix(path), root)) continue
    total += (await verifiedCopy(item, path, defaultVerifyDeps, signal))
      ? item.size
      : await reusablePartial(path, item.resume_key ?? item.url, item.size, usesRanges(item, item.size))
  }
  return total
}
