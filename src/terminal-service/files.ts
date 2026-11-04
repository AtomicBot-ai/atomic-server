import { open, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { AtcError } from '../errors/index.js'
/** Explicitly chosen files only. The server never accepts a client-supplied filesystem path. */
export async function readSelectedFile(path: string, maximumMb: number) {
  const selected = selectedPath(path)
  const handle = await open(selected, 'r').catch((error: unknown) => selectedPathFailure(error, false))
  try {
    const stat = await handle.stat(),
      limit = maximumMb * 1024 * 1024
    if (!stat.isFile() || stat.size > limit)
      throw new AtcError('ATC_USAGE', `Choose a file smaller than ${maximumMb} MB.`)
    const buffer = Buffer.alloc(limit + 1)
    let offset = 0
    while (offset < buffer.length) {
      const chunk = await handle.read(buffer, offset, buffer.length - offset, offset)
      if (!chunk.bytesRead) break
      offset += chunk.bytesRead
    }
    if (offset > limit) throw new AtcError('ATC_USAGE', `Choose a file smaller than ${maximumMb} MB.`)
    return { name: basename(selected), data: buffer.subarray(0, offset).toString('base64') }
  } finally {
    await handle.close()
  }
}
export async function writeSelectedFile(path: string, data: string) {
  const selected = selectedPath(path)
  try {
    await writeFile(selected, Buffer.from(data, 'base64'), { flag: 'wx', mode: 0o600 })
  } catch (error) {
    selectedPathFailure(error, true)
  }
  return selected
}

function selectedPath(path: string): string {
  const input = path.trim().replace(/^(['"])(.*)\1$/, '$2')
  if (!input) throw new AtcError('ATC_USAGE', 'Choose a file path.')
  return resolve(input)
}

function selectedPathFailure(error: unknown, writing: boolean): never {
  // Only input/path refusals are expected; disk and resource failures retain their original identity.
  const code = (error as NodeJS.ErrnoException | null)?.code
  if (writing && code === 'EEXIST')
    throw new AtcError('ATC_USAGE', 'This file already exists. Choose another file name.')
  if (code === 'EISDIR') throw new AtcError('ATC_USAGE', 'Choose a file.')
  if (code === 'ENOENT' || code === 'ENOTDIR')
    throw new AtcError(
      'ATC_USAGE',
      writing
        ? 'Choose an existing folder for this file.'
        : 'That file was not found. Choose an existing file.'
    )
  if (code === 'EACCES' || code === 'EPERM')
    throw new AtcError(
      'ATC_USAGE',
      `That file cannot be ${writing ? 'written' : 'read'}. Check its permissions or choose another file.`
    )
  throw error
}
