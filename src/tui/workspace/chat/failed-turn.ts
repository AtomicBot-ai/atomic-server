import { messageText } from '../../../terminal-service/index.js'
import type { WorkspaceState } from '../state.js'

/**
 * The state after a turn failed: the empty answer it opened is dropped (a part that arrived stays), the
 * reason is said, and the sent text comes back unless the person typed something new meanwhile.
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
    messages: empty ? now.messages.slice(0, -1) : now.messages,
    ...(now.draft ? {} : { draft: sent.draft, documents: sent.documents, images: sent.images }),
  }
}
