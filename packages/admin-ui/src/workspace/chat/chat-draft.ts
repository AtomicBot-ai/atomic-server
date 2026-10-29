/**
 * The words typed into the composer and not sent yet, kept outside the Chat component: leaving the
 * Playground (Open server, the catalog) unmounts it, and the draft must be there on return. Per
 * conversation in session storage (and memory when storage is blocked), by the key the chat session uses (`chat.id`, or `draft_key` for a new chat).
 */

import { useState } from 'react'

const drafts = new Map<string, string>()

export const draftKey = (chat: { id?: unknown; draft_key?: unknown }): string =>
  String(chat.id ?? chat.draft_key ?? '')

const storageKey = (key: string) => `atomic:playground:draft:v1:${key}`

export function readDraft(key: string): string {
  if (drafts.has(key)) return drafts.get(key)!
  try {
    return sessionStorage.getItem(storageKey(key)) ?? ''
  } catch {
    return ''
  }
}

export function writeDraft(key: string, value: string): void {
  if (value) drafts.set(key, value)
  else drafts.delete(key)
  try {
    if (value) sessionStorage.setItem(storageKey(key), value)
    else sessionStorage.removeItem(storageKey(key))
  } catch {
    /* Memory retains the draft if storage is unavailable or full. */
  }
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
