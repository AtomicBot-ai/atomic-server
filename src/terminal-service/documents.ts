import { documentText } from '../document-import/index.js'
import { open } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
export interface ChatDocument {
  name: string
  text: string
}
/** Read only the file explicitly chosen by the terminal user, bounded before and after reads. */
export async function readChatDocument(path: string, maximumMb: number): Promise<ChatDocument> {
  const selected = resolve(path.trim().replace(/^(['"])(.*)\1$/, '$2')),
    file = await open(selected, 'r'),
    limit = maximumMb * 1024 * 1024
  try {
    const stat = await file.stat()
    if (!stat.isFile()) throw new Error('Choose a document file.')
    if (stat.size > limit) throw new Error(`Choose a document smaller than ${maximumMb} MB.`)
    const data = Buffer.alloc(Math.min(limit + 1, stat.size + 1))
    let size = 0
    while (size < data.length) {
      const next = await file.read(data, size, data.length - size, size)
      if (!next.bytesRead) break
      size += next.bytesRead
    }
    if (size > limit) throw new Error(`Choose a document smaller than ${maximumMb} MB.`)
    const text = await documentText(selected, data.subarray(0, size), maximumMb)
    return { name: basename(selected), text }
  } finally {
    await file.close()
  }
}
