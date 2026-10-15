// Lifted from atomic-chat-core/src/downloads/downloader.ts @ 8a38521 (v0.17.0); adapted: the filesystem and timing helpers of the downloader, in their own file.
/** Filesystem and timing helpers of the downloader: containment, free space, sleep, sidecar names. */

import { realpath, statfs } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { diskErrToString } from './disk.js'
import { sidecarPath } from './protocol.js'

export const DOWNLOAD_CANCELLED = 'Download cancelled'

/** An fs error as the tagged `Error: [disk_*] …` the app's telemetry reads. */
export const diskError = (e: unknown) => new Error(diskErrToString(e))

/** A cancel or a disk error: retrying the stream does not help. */
export const isFinalError = (e: unknown) =>
  e instanceof Error && (e.message === DOWNLOAD_CANCELLED || e.message.startsWith('Error: ['))

/** The partial file, the URL it came from, and the state of its parallel ranges. */
export function sidecars(savePath: string) {
  return {
    tmp: sidecarPath(savePath, 'tmp'),
    url: sidecarPath(savePath, 'url'),
    ranges: sidecarPath(savePath, 'ranges'),
    rangesNext: sidecarPath(savePath, 'ranges.next'),
  }
}

export async function defaultAvailableSpace(path: string): Promise<number | undefined> {
  let probe = path
  for (;;) {
    try {
      const s = await statfs(probe)
      return Number(s.bavail) * Number(s.bsize)
    } catch {
      const parent = dirname(probe)
      if (parent === probe) return undefined
      probe = parent
    }
  }
}

export function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((res, rej) => {
    if (signal.aborted) return rej(new Error(DOWNLOAD_CANCELLED))
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      res()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      rej(new Error(DOWNLOAD_CANCELLED))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** Resolve the longest existing prefix through symlinks, then re-append the rest. */
export async function canonicalizeExistingPrefix(path: string): Promise<string> {
  const abs = resolve(path)
  let head = abs
  const tail: string[] = []
  for (;;) {
    try {
      const real = await realpath(head)
      return tail.length ? join(real, ...tail.reverse()) : real
    } catch {
      const parent = dirname(head)
      if (parent === head) return abs
      tail.push(head.slice(parent.length).replace(/^[\\/]/, ''))
      head = parent
    }
  }
}

export function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}
