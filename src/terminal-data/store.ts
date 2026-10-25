import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { AtcError } from '../errors/index.js'

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
/** The lock's holder is gone: a pid that no longer answers, or a lock older than any mutation takes. */
async function lockAbandoned(lock: string): Promise<boolean> {
  const held = await readFile(lock, 'utf8').catch(() => null)
  if (held === null) return false
  const pid = Number(held.trim())
  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid, 0)
      return false
    } catch (error) {
      // EPERM: the process exists but belongs to someone else; anything else: no such process.
      return (error as NodeJS.ErrnoException).code !== 'EPERM'
    }
  }
  // No pid to ask (an older atc, a damaged file): only age tells.
  const age = Date.now() - ((await stat(lock).catch(() => null))?.mtimeMs ?? Date.now())
  return age > STALE_LOCK_MS
}
const STALE_LOCK_MS = 30_000

/**
 * Serialize mutations across terminal processes; never replace a damaged document. A lock whose holder
 * died (killed between taking and releasing it) is taken over instead of refusing every later mutation.
 */
export async function mutateDocument<T>(
  path: string,
  fallback: T,
  change: (value: T) => T,
  deps: { waitMs?: number } = {}
): Promise<T> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const lock = `${path}.lock`
  const deadline = Date.now() + (deps.waitMs ?? 5000)
  let reclaimed = false
  for (;;) {
    try {
      const fd = await open(lock, 'wx', 0o600)
      try {
        await fd.writeFile(String(process.pid))
      } finally {
        await fd.close()
      }
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (!reclaimed && (await lockAbandoned(lock))) {
        reclaimed = true
        await rm(lock, { force: true })
        continue
      }
      if (Date.now() > deadline)
        throw new AtcError('ATC_INTERNAL', `Another atc process holds ${lock}.`, {
          hint: 'If no other atc is running, delete that file and try again.',
        })
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
