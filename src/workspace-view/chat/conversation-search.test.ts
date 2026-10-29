import { expect, it } from 'vitest'
import { conversationSearchText } from './conversation-search.js'
it('searches text and reasoning without structural keys, roles, metadata or embedded images', () => {
  const text = conversationSearchText({
    title: 'Title',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'HELLO_879' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,hidden' } },
        ],
      },
      {
        role: 'assistant',
        content: 'WORLD_321',
        reasoning_content: 'Considering',
        atomic_meta: { model: 'hidden-model' },
      },
    ],
  })
  expect(text).toContain('HELLO_879')
  expect(text).toContain('WORLD_321')
  expect(text).toContain('Considering')
  for (const hidden of ['role', 'content', 'base64', 'hidden-model', 'atomic_meta', 'assistant'])
    expect(text).not.toContain(hidden)
})
