/**
 * The words typed into the composer and not sent yet, kept outside the Chat component: leaving the
 * Playground (Open server, the catalog) unmounts it, and the draft must be there on return. Per
 * conversation, by the key the chat session uses (`chat.id`, or `draft_key` for a new chat).
 */

import { useState } from 'react'

const drafts = new Map<string, string>()

export const draftKey = (chat: { id?: unknown; draft_key?: unknown }): string =>
  String(chat.id ?? chat.draft_key ?? '')

export const readDraft = (key: string): string => drafts.get(key) ?? ''

export function writeDraft(key: string, value: string): void {
  if (value) drafts.set(key, value)
  else drafts.delete(key)
}

/** The draft of `chat` as component state, written through to the store; `restore` after a chat switch. */
export function useChatDraft(chat: { id?: unknown; draft_key?: unknown }) {
  const [draft, setDraftState] = useState(() => readDraft(draftKey(chat)))
  const setDraft = (value: string) => {
    writeDraft(draftKey(chat), value)
    setDraftState(value)
  }
  const restore = () => setDraftState(readDraft(draftKey(chat)))
  return [draft, setDraft, restore] as const
}
