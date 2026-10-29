import { expect, it } from 'vitest'
import { conversationPrint, savedConversationChange } from './saved-conversation.js'

const shown = { id: 'c1', title: 'Chat', messages: [{ role: 'user', content: 'hi' }] }
const synced = conversationPrint(shown)
const reply = [...shown.messages, { role: 'assistant', content: 'LIVE-99 acknowledged' }]

it.each([
  ['the same copy', { ...shown }, synced, 'keep'],
  ['a turn another client added', { ...shown, messages: reply }, synced, 'adopt'],
  ['a rename in another client', { ...shown, title: 'Renamed' }, synced, 'adopt'],
  ['a deletion of a chat saved before', null, synced, 'deleted'],
  ['no copy of a chat never saved', null, undefined, 'keep'],
  // This client changed the chat and has not saved it yet: its own reply is newer than the disk.
  [
    'an older copy while local changes are unsaved',
    { ...shown },
    conversationPrint({ ...shown, messages: [] }),
    'keep',
  ],
  ['a copy of another conversation', { ...shown, id: 'c2', messages: reply }, synced, 'keep'],
] as const)('%s: %s', (_, saved, last, change) => {
  expect(savedConversationChange(shown, saved, last)).toBe(change)
})

it('adopts a newer revision even when only request settings changed', () => {
  expect(savedConversationChange({ ...shown, revision: 2 }, { ...shown, revision: 3 }, synced)).toBe('adopt')
})
