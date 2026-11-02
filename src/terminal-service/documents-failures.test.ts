import { afterEach, expect, it, vi } from 'vitest'
import { open } from 'node:fs/promises'
import type * as Fs from 'node:fs/promises'
import { readChatDocument } from './index.js'
import { failureReport } from '../telemetry/index.js'

vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof Fs>()),
  open: vi.fn(),
}))
afterEach(() => vi.resetAllMocks())
const context = { component: 'tui', operation: 'workspace.action' }

it.each([
  ['EISDIR', 'Choose a document file.'],
  ['ENOENT', 'That document was not found. Choose an existing file.'],
  ['ENOTDIR', 'That document was not found. Choose an existing file.'],
  ['EACCES', 'That document cannot be read. Check its permissions or choose another file.'],
  ['EPERM', 'That document cannot be read. Check its permissions or choose another file.'],
])('keeps an expected %s open refusal local', async (code, message) => {
  vi.mocked(open).mockRejectedValue(Object.assign(new Error('private path'), { code }))
  const error = await readChatDocument('/selected/document.txt', 1).catch((error: unknown) => error)
  expect(error).toMatchObject({ code: 'ATC_USAGE', message })
  expect(failureReport(error, context)).toBeNull()
})

it.each(['EIO', 'EMFILE'])('preserves an unexpected %s open failure for reporting', async (code) => {
  const failure = Object.assign(new Error('private path'), { code })
  vi.mocked(open).mockRejectedValue(failure)
  await expect(readChatDocument('/selected/document.txt', 1)).rejects.toBe(failure)
  expect(failureReport(failure, context)).toMatchObject({ tags: { error_code: code } })
})

it('refuses a file that grows beyond the limit and closes its handle', async () => {
  const close = vi.fn().mockResolvedValue(undefined)
  vi.mocked(open).mockResolvedValue({
    stat: async () => ({ isFile: () => true, size: 1 }),
    read: async () => ({ bytesRead: 2 }),
    close,
  } as unknown as Awaited<ReturnType<typeof open>>)
  const error = await readChatDocument('/selected/document.txt', 1 / 1024 / 1024).catch(
    (error: unknown) => error
  )
  expect(error).toMatchObject({ code: 'ATC_USAGE', message: expect.stringContaining('smaller') })
  expect(failureReport(error, context)).toBeNull()
  expect(close).toHaveBeenCalledOnce()
})

it('preserves an unexpected read failure and still closes the handle', async () => {
  const failure = Object.assign(new Error('disk failure'), { code: 'EIO' }),
    close = vi.fn().mockResolvedValue(undefined)
  vi.mocked(open).mockResolvedValue({
    stat: async () => ({ isFile: () => true, size: 1 }),
    read: async () => {
      throw failure
    },
    close,
  } as unknown as Awaited<ReturnType<typeof open>>)
  await expect(readChatDocument('/selected/document.txt', 1)).rejects.toBe(failure)
  expect(failureReport(failure, context)).not.toBeNull()
  expect(close).toHaveBeenCalledOnce()
})
