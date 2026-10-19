import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

/** What Windows answers for a moment when another handle has the target open (a reader or a writer). */
const TRANSIENT_RENAME = new Set(['EPERM', 'EACCES', 'EBUSY'])
/**
 * How long to keep trying. A reader that has the file open leaves its name "delete pending" on Windows,
 * and every rename over it fails until the reader closes; busy readers make that last seconds.
 */
const RETRY_FOR_MS = 10_000
const pause = (attempt: number) => new Promise((resolve) => setTimeout(resolve, Math.min(10 * attempt, 100)))

export async function readDocument<T>(
  path: string,
  fallback: T,
  deps: { readFile?: (path: string, encoding: 'utf8') => Promise<string> } = {}
): Promise<T> {
  const read = deps.readFile ?? readFile
  const until = Date.now() + RETRY_FOR_MS
  for (let attempt = 1; ; attempt++) {
    try {
      return JSON.parse(await read(path, 'utf8')) as T
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? ''
      if (code === 'ENOENT') return fallback
      // On Windows a read that meets a rename over the file is refused for a moment.
      if (TRANSIENT_RENAME.has(code) && Date.now() < until) {
        await pause(attempt)
        continue
      }
      throw new Error(`Cannot read ${path}. The existing file has been preserved.`, { cause: error })
    }
  }
}
export type RenameFn = (from: string, to: string) => Promise<void>

/**
 * Move `from` over `to`. On Windows a rename over a file another handle has open fails for a moment
 * (EPERM, EACCES, EBUSY): it is tried again, for up to ten seconds.
 */
export async function replaceFile(
  from: string,
  to: string,
  move: RenameFn = rename,
  retryForMs = RETRY_FOR_MS
): Promise<void> {
  const until = Date.now() + retryForMs
  for (let attempt = 1; ; attempt++) {
    try {
      return await move(from, to)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? ''
      if (!TRANSIENT_RENAME.has(code) || Date.now() >= until) throw error
      await pause(attempt)
    }
  }
}

export async function writeDocument(
  path: string,
  value: unknown,
  deps: { rename?: RenameFn; retryForMs?: number } = {}
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
    await replaceFile(temporary, path, deps.rename, deps.retryForMs)
  } finally {
    await rm(temporary, { force: true })
  }
}
/** Serialize mutations across terminal processes; never replace a damaged document. */
export async function mutateDocument<T>(path: string, fallback: T, change: (value: T) => T): Promise<T> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const lock = `${path}.lock`
  const deadline = Date.now() + 5000
  for (;;) {
    try {
      const fd = await open(lock, 'wx', 0o600)
      await fd.writeFile(String(process.pid))
      await fd.close()
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || Date.now() > deadline) throw error
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
  }
  try {
    const next = change(await readDocument(path, fallback))
    await writeDocument(path, next)
    return next
  } finally {
    await rm(lock, { force: true })
  }
}
