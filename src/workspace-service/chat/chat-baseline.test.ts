import { expect, it } from 'vitest'
import type { Conversation } from '../../terminal-data/index.js'
import { chatBaseline } from './chat-baseline.js'
const chat = {
  revision: 3,
  messages: [
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'Answer', atomic_meta: { model: 'm' } },
  ],
} as unknown as Conversation
it('requires the loaded revision for edits and regeneration', () => {
  expect(chatBaseline(chat, { expected_revision: 3 }, [])).toBe(3)
  expect(() => chatBaseline(chat, { expected_revision: 2 }, [])).toThrow('changed')
})
it('lets older clients append, but refuses an omitted or replaced turn', () => {
  expect(
    chatBaseline(chat, {}, [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Answer' },
      { role: 'user', content: 'Next' },
    ])
  ).toBe(3)
  expect(() =>
    chatBaseline(chat, {}, [
      { role: 'user', content: 'Hi' },
      { role: 'user', content: 'Next' },
    ])
  ).toThrow('changed')
  expect(() => chatBaseline(null, { conversation_id: 'deleted' }, [])).toThrow('deleted')
})
