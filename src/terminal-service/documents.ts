import { documentText } from '../document-import/index.js'
import { AtcError } from '../errors/index.js'
import { open } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
export interface ChatDocument {
  name: string
  text: string
}
/** Read only the file explicitly chosen by the terminal user, bounded before and after reads. */
export async function readChatDocument(path: string, maximumMb: number): Promise<ChatDocument> {
  const input = path.trim().replace(/^(['"])(.*)\1$/, '$2')
  if (!input) throw new AtcError('ATC_USAGE', 'Choose a document file.')
  const selected = resolve(input),
    file = await open(selected, 'r').catch((error: unknown) => {
      // Only selected-path refusals are expected; resource and disk failures remain reportable.
      const code = (error as NodeJS.ErrnoException | null)?.code
      if (code === 'EISDIR') throw new AtcError('ATC_USAGE', 'Choose a document file.')
      if (code === 'ENOENT' || code === 'ENOTDIR')
        throw new AtcError('ATC_USAGE', 'That document was not found. Choose an existing file.')
      if (code === 'EACCES' || code === 'EPERM')
        throw new AtcError(
          'ATC_USAGE',
          'That document cannot be read. Check its permissions or choose another file.'
        )
      throw error
    }),
    limit = maximumMb * 1024 * 1024
  try {
    const stat = await file.stat()
    if (!stat.isFile()) throw new AtcError('ATC_USAGE', 'Choose a document file.')
    if (stat.size > limit) throw new AtcError('ATC_USAGE', `Choose a document smaller than ${maximumMb} MB.`)
    const data = Buffer.alloc(Math.min(limit + 1, stat.size + 1))
    let size = 0
    while (size < data.length) {
      const next = await file.read(data, size, data.length - size, size)
      if (!next.bytesRead) break
      size += next.bytesRead
    }
    if (size > limit) throw new AtcError('ATC_USAGE', `Choose a document smaller than ${maximumMb} MB.`)
    const text = await documentText(selected, data.subarray(0, size), maximumMb)
    return { name: basename(selected), text }
  } finally {
    await file.close()
  }
}
