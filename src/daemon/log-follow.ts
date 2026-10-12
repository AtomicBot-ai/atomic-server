/**
 * Reading the daemon log (`<data>/atc/logs/daemon.log`, written and rotated by the server's logger):
 * its last lines, then whatever is appended. `atc logs` and the terminal UI's Logs screen read it
 * this way; the file may be large, so only its end is read. Rotation renames it to `daemon.log.1` and
 * starts a new one: the tail reaches into `.1` when the new file is short, and following finishes the
 * old file from `.1` before it starts again at the top of the new one.
 */

import { open } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { sleep } from '../core-link/index.js'

/** How much of the end of the file `readLogTail` looks at; plenty for a screen of lines. */
export const LOG_TAIL_BYTES = 512 * 1024

export function tailLines(text: string, count: number): string[] {
  const lines = text.split(/\r?\n/)
  if (lines.at(-1) === '') lines.pop()
  return lines.slice(-count)
}

async function readRange(file: FileHandle, start: number, end: number): Promise<string> {
  const buffer = Buffer.alloc(end - start)
  const { bytesRead } = await file.read(buffer, 0, buffer.length, start)
  return buffer.subarray(0, bytesRead).toString('utf8')
}

interface OpenLog {
  file: FileHandle
  size: number
  /** A rotated file is a new inode, which a size check alone misses once it grows. */
  id: string
}

/**
 * The file at `path`, open, with its size and identity taken from that same handle: a rotation between
 * a stat by path and a read by path would read the new file at the old file's offset.
 */
async function openLog(path: string): Promise<OpenLog | undefined> {
  let file: FileHandle
  try {
    file = await open(path, 'r')
  } catch {
    return undefined
  }
  try {
    const s = await file.stat()
    return { file, size: s.size, id: `${s.dev}:${s.ino}` }
  } catch {
    await file.close()
    return undefined
  }
}

/** `use` on the open file at `path`, or `fallback` when there is none; the file is closed after. */
async function withLog<T>(path: string, fallback: T, use: (log: OpenLog) => Promise<T>): Promise<T> {
  const log = await openLog(path)
  if (!log) return fallback
  try {
    return await use(log)
  } finally {
    await log.file.close()
  }
}

async function tailOf(file: FileHandle, size: number, count: number, maxBytes: number): Promise<string[]> {
  const start = Math.max(0, size - maxBytes)
  let text = await readRange(file, start, size)
  // Reading from the middle of the file: the first line is a fragment.
  if (start > 0) text = text.slice(text.indexOf('\n') + 1)
  return tailLines(text, count)
}

/** The last `count` lines and the offset to follow from; no file yet is no lines at offset 0. */
export async function readLogTail(
  path: string,
  count: number,
  maxBytes = LOG_TAIL_BYTES
): Promise<{ lines: string[]; offset: number; id?: string }> {
  const current = await withLog(path, undefined, async (log) => ({
    lines: await tailOf(log.file, log.size, count, maxBytes),
    offset: log.size,
    id: log.id,
  }))
  const lines = current?.lines ?? []
  if (lines.length < count) {
    // Just rotated: the lines before the new file's first are at the end of the previous one.
    const before = await withLog(`${path}.1`, [], (log) =>
      tailOf(log.file, log.size, count - lines.length, maxBytes)
    )
    lines.unshift(...before)
  }
  return { lines, offset: current?.offset ?? 0, ...(current ? { id: current.id } : {}) }
}

export interface FollowLogOptions {
  signal: AbortSignal
  onLines: (lines: string[]) => void
  /** Called when the file shrank (truncated or replaced) and following restarted at its top. */
  onReset?: () => void
  /** The file `offset` belongs to (`readLogTail`'s `id`), so a rotation just after the read is seen. */
  id?: string
  intervalMs?: number
}

/** Poll the file from `offset` and hand over complete new lines until `signal` aborts. */
export async function followLog(path: string, offset: number, options: FollowLogOptions): Promise<void> {
  const { signal } = options
  let position = offset
  let partial = ''
  let id = options.id ?? (await withLog(path, undefined, async (log) => log.id))
  while (!signal.aborted) {
    await withLog(path, undefined, async ({ file, size, id: current }) => {
      const followed = id
      const replaced = followed !== undefined && current !== followed
      id = current
      if (size < position || replaced) {
        // Rotated: what was appended to the old file since the last read is now the end of `.1`. It is
        // the file followed so far when it has its inode, even if it was already read to the end.
        const rest = await withLog(`${path}.1`, undefined, async (old) =>
          (followed !== undefined ? old.id === followed : old.size > position)
            ? readRange(old.file, position, Math.max(position, old.size))
            : undefined
        )
        if (rest !== undefined) {
          const lines = (partial + rest).split(/\r?\n/)
          if (lines.at(-1) === '') lines.pop()
          if (lines.length > 0 && !signal.aborted) options.onLines(lines)
        } else options.onReset?.()
        position = 0
        partial = ''
      }
      if (size > position) {
        const text = partial + (await readRange(file, position, size))
        position = size
        const lines = text.split(/\r?\n/)
        partial = lines.pop() ?? ''
        if (lines.length > 0 && !signal.aborted) options.onLines(lines)
      }
    })
    await sleep(options.intervalMs ?? 500, signal)
  }
}
