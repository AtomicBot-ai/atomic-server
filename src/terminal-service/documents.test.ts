import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { failureReport } from '../telemetry/index.js'
import { readChatDocument, readSelectedFile, writeSelectedFile } from './index.js'
let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'atc-documents-'))
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(dir, { recursive: true, force: true })
})
it('reads only the selected bounded document and rejects invalid binary or oversized files', async () => {
  const path = join(dir, 'notes.txt')
  await writeFile(path, 'Review notes')
  expect(await readChatDocument(path, 1)).toEqual({ name: 'notes.txt', text: 'Review notes' })
  expect(await readChatDocument(` "${path}" `, 1)).toEqual({ name: 'notes.txt', text: 'Review notes' })
  await writeFile(path, new Uint8Array(1024 * 1024 + 1))
  await expect(readChatDocument(path, 1)).rejects.toMatchObject({
    code: 'ATC_USAGE',
    message: expect.stringContaining('smaller'),
  })
  await writeFile(path, new Uint8Array([0]))
  await expect(readChatDocument(path, 1)).rejects.toThrow('binary')
  await expect(readChatDocument(dir, 1)).rejects.toMatchObject({
    code: 'ATC_USAGE',
    message: 'Choose a document file.',
  })
})
it.each(['', ' ', '""', "''"])('refuses an empty selected path (%j) as usage', async (path) => {
  await expect(readChatDocument(path, 1)).rejects.toMatchObject({
    code: 'ATC_USAGE',
    message: 'Choose a document file.',
  })
})
it('refuses missing files and a file used as a parent directory as usage', async () => {
  const path = join(dir, 'notes.txt')
  await expect(readChatDocument(path, 1)).rejects.toMatchObject({
    code: 'ATC_USAGE',
    message: 'That document was not found. Choose an existing file.',
  })
  await writeFile(path, 'Review notes')
  await expect(readChatDocument(join(path, 'child.txt'), 1)).rejects.toMatchObject({ code: 'ATC_USAGE' })
})
it('round-trips explicitly selected packages and never silently overwrites an existing file', async () => {
  const path = join(dir, 'review.skill'),
    data = Buffer.from('package').toString('base64')
  expect(await writeSelectedFile(path, data)).toBe(path)
  expect(await readSelectedFile(path, 10)).toEqual({ name: 'review.skill', data })
  await expect(writeSelectedFile(path, data)).rejects.toThrow('already exists')
})

it.each(['', ' ', '""', "''"])('rejects an empty selected package path (%j) as usage', async (path) => {
  await expect(readSelectedFile(path, 1)).rejects.toMatchObject({ code: 'ATC_USAGE' })
  await expect(writeSelectedFile(path, 'eA==')).rejects.toMatchObject({ code: 'ATC_USAGE' })
})
it('keeps selected package validation and path refusals out of defect reporting', async () => {
  const missing = join(dir, 'missing.skill')
  const large = join(dir, 'large.skill')
  await writeFile(large, new Uint8Array(1024 * 1024 + 1))
  for (const action of [
    () => readSelectedFile(missing, 1),
    () => readSelectedFile(dir, 1),
    () => readSelectedFile(large, 1),
    () => readSelectedFile(join(large, 'child'), 1),
    () => writeSelectedFile(missing + '/child', 'eA=='),
    () => writeSelectedFile(dir, 'eA=='),
    () => writeSelectedFile(large, 'eA=='),
  ]) {
    try {
      await action()
      throw new Error('Expected a selected-path refusal')
    } catch (error) {
      expect(error).toMatchObject({ code: 'ATC_USAGE' })
      expect(failureReport(error, { component: 'tui', operation: 'workspace.action' })).toBeNull()
    }
  }
  expect((await readFile(large)).byteLength).toBe(1024 * 1024 + 1)
})
it('retains unexpected selected-file I/O failures for defect reporting', async () => {
  const path = join(dir, 'review.skill')
  await writeFile(path, 'data')
  const handle = await open(path, 'r')
  const prototype = Object.getPrototypeOf(handle) as { read: typeof handle.read }
  await handle.close()
  const failure = Object.assign(new Error('I/O fixture failure'), { code: 'EIO' })
  vi.spyOn(prototype, 'read').mockRejectedValueOnce(failure)
  await expect(readSelectedFile(path, 1)).rejects.toBe(failure)
  expect(failureReport(failure, { component: 'tui', operation: 'workspace.action' })?.tags?.error_code).toBe(
    'EIO'
  )
})
