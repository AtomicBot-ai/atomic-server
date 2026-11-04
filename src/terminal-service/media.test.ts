import { mkdtemp, writeFile, rm, truncate } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { failureReport } from '../telemetry/index.js'
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
it('treats expected selected image path, format and size refusals as usage without reporting', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atc-image-'))
  try {
    for (const empty of ['', ' ', '""', "''"]) {
      const err = await readChatImage(empty).catch((error: unknown) => error)
      expect(err).toMatchObject({ code: 'ATC_USAGE', message: 'Choose an image file.' })
      expect(failureReport(err, { component: 'tui', operation: 'workspace.action' })).toBeNull()
    }
    const dirErr = await readChatImage(directory).catch((error: unknown) => error)
    expect(dirErr).toMatchObject({ code: 'ATC_USAGE', message: 'Choose an image file.' })
    expect(failureReport(dirErr, { component: 'tui', operation: 'workspace.action' })).toBeNull()

    const missing = join(directory, 'missing.png')
    const missingErr = await readChatImage(missing).catch((error: unknown) => error)
    expect(missingErr).toMatchObject({
      code: 'ATC_USAGE',
      message: 'That image was not found. Choose an existing file.',
    })
    expect(failureReport(missingErr, { component: 'tui', operation: 'workspace.action' })).toBeNull()

    const text = join(directory, 'not-image.png')
    await writeFile(text, 'This is not a PNG')
    const childErr = await readChatImage(join(text, 'child.png')).catch((error: unknown) => error)
    expect(childErr).toMatchObject({
      code: 'ATC_USAGE',
      message: 'That image was not found. Choose an existing file.',
    })
    expect(failureReport(childErr, { component: 'tui', operation: 'workspace.action' })).toBeNull()

    const formatErr = await readChatImage(text).catch((error: unknown) => error)
    expect(formatErr).toMatchObject({
      code: 'ATC_USAGE',
      message: 'Use a PNG, JPEG, WebP or GIF image.',
    })
    expect(failureReport(formatErr, { component: 'tui', operation: 'workspace.action' })).toBeNull()

    const image = join(directory, 'large.png')
    await writeFile(image, signature)
    await truncate(image, 8 * 1024 * 1024 + 1)
    const sizeErr = await readChatImage(image).catch((error: unknown) => error)
    expect(sizeErr).toMatchObject({
      code: 'ATC_USAGE',
      message: 'Choose an image smaller than 8 MB.',
    })
    expect(failureReport(sizeErr, { component: 'tui', operation: 'workspace.action' })).toBeNull()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
