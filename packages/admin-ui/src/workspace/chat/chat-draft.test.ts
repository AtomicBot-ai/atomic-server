import { expect, it, vi } from 'vitest'
import { readDraft, writeDraft } from './chat-draft'
it('restores unsent text after a page reload and removes it after sending', async () => {
  writeDraft('conversation-qa', 'DRAFT_RECOVERY_KEEP_879')
  vi.resetModules()
  const reloaded = await import('./chat-draft')
  expect(reloaded.readDraft('conversation-qa')).toBe('DRAFT_RECOVERY_KEEP_879')
  expect(reloaded.readDraft('another-conversation')).toBe('')
  reloaded.writeDraft('conversation-qa', '')
  vi.resetModules()
  expect((await import('./chat-draft')).readDraft('conversation-qa')).toBe('')
})
it('keeps drafts isolated by conversation', () => {
  writeDraft('a', 'one')
  writeDraft('b', 'two')
  expect(readDraft('a')).toBe('one')
  expect(readDraft('b')).toBe('two')
})
