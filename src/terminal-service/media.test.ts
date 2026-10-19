import { mkdtemp, writeFile, rm, truncate } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { readChatImage } from './media.js'
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
it('reads only selected bounded local image files and preserves their actual format', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atc-image-'))
  try {
    const image = join(directory, 'selected image.png')
    await writeFile(image, signature)
    const result = await readChatImage(`"${image}"`)
    expect(result).toMatchObject({
      name: 'selected image.png',
      bytes: 8,
      url: `data:image/png;base64,${signature.toString('base64')}`,
    })
    const text = join(directory, 'not-image.png')
    await writeFile(text, 'This is not a PNG')
    await expect(readChatImage(text)).rejects.toThrow('PNG, JPEG')
    await expect(readChatImage(directory)).rejects.toThrow('image file')
    await truncate(image, 8 * 1024 * 1024 + 1)
    await expect(readChatImage(image)).rejects.toThrow('8 MB')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
