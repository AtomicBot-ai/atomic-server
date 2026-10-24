import { beforeEach, afterEach, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readChatDocument, readSelectedFile, writeSelectedFile } from './index.js'
let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'atc-documents-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})
it('reads only the selected bounded document and rejects invalid binary or oversized files', async () => {
  const path = join(dir, 'notes.txt')
  await writeFile(path, 'Review notes')
  expect(await readChatDocument(path, 1)).toEqual({ name: 'notes.txt', text: 'Review notes' })
  await writeFile(path, new Uint8Array(1024 * 1024 + 1))
  await expect(readChatDocument(path, 1)).rejects.toThrow('smaller')
  await writeFile(path, new Uint8Array([0]))
  await expect(readChatDocument(path, 1)).rejects.toThrow('binary')
  await expect(readChatDocument(dir, 1)).rejects.toThrow('file')
})
it('round-trips explicitly selected packages and never silently overwrites an existing file', async () => {
  const path = join(dir, 'review.skill'),
    data = Buffer.from('package').toString('base64')
  expect(await writeSelectedFile(path, data)).toBe(path)
  expect(await readSelectedFile(path, 10)).toEqual({ name: 'review.skill', data })
  await expect(writeSelectedFile(path, data)).rejects.toThrow('already exists')
})
