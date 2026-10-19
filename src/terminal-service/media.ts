import { open } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
export interface ChatImage {
  name: string
  url: string
  bytes: number
}
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
/** Read a user-selected local image; never follow an image URL or interpret shell syntax. */
export async function readChatImage(path: string): Promise<ChatImage> {
  const selected = resolve(path.trim().replace(/^(['"])(.*)\1$/, '$2'))
  const file = await open(selected, 'r')
  try {
    const info = await file.stat()
    if (!info.isFile()) throw new Error('Choose an image file.')
    if (info.size > MAX_IMAGE_BYTES) throw new Error('Choose an image smaller than 8 MB.')
    const data = Buffer.alloc(Math.min(MAX_IMAGE_BYTES + 1, info.size + 1))
    let size = 0
    while (size < data.length) {
      const read = await file.read(data, size, data.length - size, size)
      if (!read.bytesRead) break
      size += read.bytesRead
    }
    if (size > MAX_IMAGE_BYTES) throw new Error('Choose an image smaller than 8 MB.')
    const bytes = data.subarray(0, size)
    const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? 'image/png'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? 'image/jpeg'
        : /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())
          ? 'image/gif'
          : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
            ? 'image/webp'
            : ''
    if (!mime) throw new Error('Use a PNG, JPEG, WebP or GIF image.')
    return { name: basename(selected), url: `data:${mime};base64,${bytes.toString('base64')}`, bytes: size }
  } finally {
    await file.close()
  }
}
