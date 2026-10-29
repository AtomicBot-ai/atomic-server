/**
 * A conversation open in one client while another changes it. Both clients read the saved copy again
 * every few seconds and decide here whether it is another client's change.
 */

interface ConversationCopy {
  id?: unknown
  title?: unknown
  messages?: unknown
}

/** What a client compares with the saved copy: the title and the messages. */
export function conversationPrint(chat: ConversationCopy): string {
  return JSON.stringify([chat.title ?? '', chat.messages ?? []])
}

/**
 * `synced` is the print this client last saved or loaded for the conversation it shows. A saved copy
 * that differs is another client's change, unless this client has a change it has not saved yet: then
 * its own copy is the newer one. A copy gone after one was saved is a deletion.
 */
export function savedConversationChange(
  shown: ConversationCopy,
  saved: ConversationCopy | null,
  synced: string | undefined
): 'keep' | 'adopt' | 'deleted' {
  if (!saved?.id) return synced === undefined ? 'keep' : 'deleted'
  if (saved.id !== shown.id) return 'keep'
  const local = conversationPrint(shown)
  if (synced !== undefined && local !== synced) return 'keep'
  return conversationPrint(saved) === local ? 'keep' : 'adopt'
}
