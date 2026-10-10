/**
 * Reading the daemon log (`<data>/atc/logs/daemon.log`, written and rotated by the server's logger):
 * its last lines, then whatever is appended. `atc logs` and the terminal UI's Logs screen read it
 * this way; the file may be large, so only its end is read. Rotation renames it to `daemon.log.1` and
 * starts a new one: the tail reaches into `.1` when the new file is short, and following finishes the
 * old file from `.1` before it starts again at the top of the new one.
 */

import { open, stat } from 'node:fs/promises'
import { sleep } from '../core-link/index.js'

/** How much of the end of the file `readLogTail` looks at; plenty for a screen of lines. */
export const LOG_TAIL_BYTES = 512 * 1024

export function tailLines(text: string, count: number): string[] {
  const lines = text.split(/\r?\n/)
  if (lines.at(-1) === '') lines.pop()
  return lines.slice(-count)
}

async function readRange(path: string, start: number, end: number): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(end - start)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start)
    return buffer.subarray(0, bytesRead).toString('utf8')
  } finally {
    await handle.close()
  }
}

async function sizeOf(path: string): Promise<number | undefined> {
  return (await fileState(path))?.size
}

/** Size and identity: a rotated file is a new inode, which a size check alone misses once it grows. */
async function fileState(path: string): Promise<{ size: number; id: string } | undefined> {
  try {
    const s = await stat(path)
    return { size: s.size, id: `${s.dev}:${s.ino}` }
  } catch {
    return undefined
  }
}

async function tailOf(path: string, size: number, count: number, maxBytes: number): Promise<string[]> {
  const start = Math.max(0, size - maxBytes)
  let text = await readRange(path, start, size)
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
  const state = await fileState(path)
  const size = state?.size
  const lines = size === undefined ? [] : await tailOf(path, size, count, maxBytes)
  if (lines.length < count) {
    // Just rotated: the lines before the new file's first are at the end of the previous one.
    const previous = `${path}.1`
    const before = await sizeOf(previous)
    if (before !== undefined)
      lines.unshift(...(await tailOf(previous, before, count - lines.length, maxBytes)))
  }
  return { lines, offset: size ?? 0, ...(state ? { id: state.id } : {}) }
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
  let id = options.id ?? (await fileState(path))?.id
  while (!signal.aborted) {
    const state = await fileState(path)
    const size = state?.size
    const replaced = state !== undefined && id !== undefined && state.id !== id
    if (state) id = state.id
    if (size !== undefined && (size < position || replaced)) {
      // Rotated: what was appended to the old file since the last read is now the end of `.1`.
      const previous = `${path}.1`
      const rest = await sizeOf(previous)
      if (rest !== undefined && rest > position) {
        const lines = (partial + (await readRange(previous, position, rest))).split(/\r?\n/)
        if (lines.at(-1) === '') lines.pop()
        if (lines.length > 0 && !signal.aborted) options.onLines(lines)
      } else options.onReset?.()
      position = 0
      partial = ''
    }
    if (size !== undefined && size > position) {
      const text = partial + (await readRange(path, position, size))
      position = size
      const lines = text.split(/\r?\n/)
      partial = lines.pop() ?? ''
      if (lines.length > 0 && !signal.aborted) options.onLines(lines)
    }
    await sleep(options.intervalMs ?? 500, signal)
  }
}
