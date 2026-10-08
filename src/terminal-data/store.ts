import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

export async function readDocument<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw new Error(`Cannot read ${path}. The existing file has been preserved.`, { cause: error })
  }
}
export async function writeDocument(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
    await rename(temporary, path)
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
