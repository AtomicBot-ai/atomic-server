/**
 * What a download left on disk, for a job nobody runs (the server restarted mid-way): the bytes every
 * recorded range reached, else the single-stream partial's size, else the finished file's; `0` when the
 * partial belongs to another URL or there is none. The Downloads list shows these instead of 0 B.
 */

import { stat } from 'node:fs/promises'
import { rangedBytes, readRangeState } from './ranges.js'
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
