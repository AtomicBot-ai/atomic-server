import { expect, it } from 'vitest'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import { failedTurn } from './failed-turn.js'

const sent = {
  ...createWorkspace('chat'),
  draft: 'Reply with OK.',
  documents: [],
  images: [],
} as WorkspaceState
const after = (messages: WorkspaceState['messages'], draft = '') =>
  ({ ...sent, draft, generating: true, messages }) as WorkspaceState

// E2E B03: a failed turn left an empty "No text returned." answer behind.
it('drops the empty answer a failed turn left, says why, and gives the sent text back', () => {
  const now = after([
    { role: 'user', content: 'Reply with OK.' },
    { role: 'assistant', content: '' },
  ])
  expect(failedTurn(now, sent, 'Unable to connect.')).toEqual({
    generating: false,
    message: 'Unable to connect.',
    messages: sent.messages,
    conversation: sent.conversation,
    draft: 'Reply with OK.',
    cursor: sent.cursor,
    documents: [],
    images: [],
  })
})

it('keeps the part of an answer that arrived, and a draft typed meanwhile', () => {
  const now = after(
    [
      { role: 'user', content: 'Reply with OK.' },
      { role: 'assistant', content: 'O' },
    ],
    'next question'
  )
  expect(failedTurn(now, sent, 'Stream ended.')).toEqual({
    generating: false,
    message: 'Stream ended.',
    messages: now.messages,
  })
})
