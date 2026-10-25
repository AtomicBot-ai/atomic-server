import { open, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
/** Explicitly chosen files only. The server never accepts a client-supplied filesystem path. */
export async function readSelectedFile(path: string, maximumMb: number) {
  const selected = resolve(path.trim().replace(/^(['"])(.*)\1$/, '$2'))
  const handle = await open(selected, 'r')
  try {
    const stat = await handle.stat(),
      limit = maximumMb * 1024 * 1024
    if (!stat.isFile() || stat.size > limit) throw new Error(`Choose a file smaller than ${maximumMb} MB.`)
    const buffer = Buffer.alloc(limit + 1)
    let offset = 0
    while (offset < buffer.length) {
      const chunk = await handle.read(buffer, offset, buffer.length - offset, offset)
      if (!chunk.bytesRead) break
      offset += chunk.bytesRead
    }
    if (offset > limit) throw new Error(`Choose a file smaller than ${maximumMb} MB.`)
    return { name: basename(selected), data: buffer.subarray(0, offset).toString('base64') }
  } finally {
    await handle.close()
  }
}
export async function writeSelectedFile(path: string, data: string) {
  const selected = resolve(path.trim().replace(/^(['"])(.*)\1$/, '$2'))
  try {
    await writeFile(selected, Buffer.from(data, 'base64'), { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new Error('This file already exists. Choose another file name.')
    throw error
  }
  return selected
}
