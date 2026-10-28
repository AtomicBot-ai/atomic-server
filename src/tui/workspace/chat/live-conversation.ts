import { conversationPrint, savedConversationChange } from '../../../workspace-view/index.js'
import type { Conversation } from '../../../terminal-data/index.js'
import type { WorkspaceController } from '../controller.js'
import type { WorkspaceState } from '../state.js'

/** Each conversation as this terminal last saved or loaded it, by controller: `savedConversationChange`. */
const prints = new WeakMap<WorkspaceController, Map<string, string>>()

export function markSynced(c: WorkspaceController, chat: Pick<Conversation, 'id' | 'title' | 'messages'>) {
  let known = prints.get(c)
  if (!known) prints.set(c, (known = new Map()))
  known.set(chat.id, conversationPrint(chat))
}

/**
 * What the saved copy read while `before` was shown changes now: another client's turn or rename is
 * taken, a deletion leaves an empty chat. The draft, cursor, focus and scroll stay as they are; nothing
 * changes while a turn runs here or once the chat on screen has changed since the read.
 */
export function savedConversationPatch(
  c: WorkspaceController,
  before: WorkspaceState,
  now: WorkspaceState,
  saved: Conversation | null
): Partial<WorkspaceState> {
  const open = now.conversation
  if (!open || before.generating || now.generating) return {}
  if (open.id !== before.conversation?.id || now.messages !== before.messages) return {}
  const shown = { id: open.id, title: open.title, messages: now.messages }
  const change = savedConversationChange(shown, saved, prints.get(c)?.get(open.id))
  if (change === 'adopt' && saved) {
    markSynced(c, saved)
    return { conversation: saved, messages: saved.messages }
  }
  if (change === 'deleted') {
    prints.get(c)?.delete(open.id)
    return { conversation: null, messages: [], message: 'This chat was deleted in another window.' }
  }
  return {}
}
