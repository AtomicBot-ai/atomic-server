// Lifted from atomic-chat-core/src/downloads/downloader.ts @ 8a38521 (v0.17.0); adapted: the filesystem and timing helpers of the downloader, in their own file.
/** Filesystem and timing helpers of the downloader: containment, free space, sleep, sidecar names. */

import { constants } from 'node:fs'
import { lstat, open, realpath, statfs } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
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

async function sidecarKind(path: string): Promise<'absent' | 'file' | 'symlink' | 'other'> {
  try {
    const st = await lstat(path)
    if (st.isSymbolicLink()) return 'symlink'
    return st.isFile() ? 'file' : 'other'
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'absent'
    throw error
  }
}

function refuse(path: string, kind: 'symlink' | 'other'): never {
  throw new Error(
    kind === 'symlink' ? 'Refusing to write through a symlink: ' + path : 'Refusing to write through a non-file: ' + path
  )
}

/** Open a sidecar without following a symlink, creating a new `w+` file exclusively. */
export async function openSidecar(path: string, flags: 'w+' | 'r+' | 'a'): Promise<FileHandle> {
  const kind = await sidecarKind(path)
  if (kind === 'symlink' || kind === 'other') refuse(path, kind)
  if (kind === 'absent' && flags === 'w+') return open(path, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR)
  return open(path, flags)
}

/** `writeFile` of `.url` and `.ranges.next` must not follow a symlink either. */
export async function refuseSidecarWrite(path: string): Promise<void> {
  const kind = await sidecarKind(path)
  if (kind === 'symlink' || kind === 'other') refuse(path, kind)
}
