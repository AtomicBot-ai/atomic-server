import { expect, it, vi } from 'vitest'
import { DEFAULT_ATTACHMENTS } from '../contract/index.js'
import { prepareAttachment } from './embedding-retrieval.js'
it('uses embedding similarity, not keyword overlap, and keeps source ordering', async () => {
  const embed = vi.fn(async (input: string[]) =>
    input.map((value) => (value.includes('feline') ? [1, 0] : value.includes('cat') ? [1, 0] : [0, 1]))
  )
  const value = await prepareAttachment(
    {
      ...DEFAULT_ATTACHMENTS,
      parse_mode: 'embeddings',
      chunk_size_chars: 200,
      overlap_chars: 0,
      retrieval_limit: 1,
      retrieval_threshold: 0.5,
    },
    'animals.txt',
    'feline '.repeat(28) + ' '.repeat(4) + 'canine '.repeat(28),
    'cat',
    embed
  )
  expect(value.mode).toBe('embeddings')
  expect(value.content).toContain('feline')
  expect(value.content).not.toContain('canine')
  expect(embed).toHaveBeenCalled()
})
it('keeps small documents inline automatically and reports missing embedding models for retrieval', async () => {
  const embed = vi.fn()
  expect(await prepareAttachment(DEFAULT_ATTACHMENTS, 'hello.txt', 'hello', 'hello', embed)).toMatchObject({
    mode: 'inline',
    content: 'hello',
  })
  expect(embed).not.toHaveBeenCalled()
  await expect(
    prepareAttachment({ ...DEFAULT_ATTACHMENTS, parse_mode: 'embeddings' }, 'hello.txt', 'hello', 'hello')
  ).rejects.toThrow('embedding model')
})
