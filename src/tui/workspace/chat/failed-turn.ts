import { messageText } from '../../../terminal-service/index.js'
import type { WorkspaceState } from '../state.js'

/**
 * A turn with no answer rolls back its optimistic transcript; the sent text returns to the draft.
 * A partial answer or a newer draft stays. An unchanged transcript can then adopt another client's save.
 */
export function failedTurn(
  now: WorkspaceState,
  sent: WorkspaceState,
  message: string
): Partial<WorkspaceState> {
  const last = now.messages.at(-1)
  const empty = last?.role === 'assistant' && !messageText(last.content) && !last.tool_calls?.length
  return {
    generating: false,
    message,
    messages: empty ? sent.messages : now.messages,
    ...(empty ? { conversation: sent.conversation } : {}),
    ...(now.draft
      ? {}
      : { draft: sent.draft, cursor: sent.cursor, documents: sent.documents, images: sent.images }),
  }
}
