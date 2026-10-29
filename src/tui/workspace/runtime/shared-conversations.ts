import { savedConversationPatch } from '../chat/live-conversation.js'
import type { WorkspaceController } from '../controller.js'
import type { WorkspaceState } from '../state.js'

/**
 * Chats another client saves reach the terminal (`useSharedPanels`): the Recents list, and the
 * conversation open here as `savedConversationPatch` decides.
 */
export async function refreshConversations(
  c: WorkspaceController,
  before: WorkspaceState,
  now: () => WorkspaceState,
  live: () => boolean,
  update: (fn: (state: WorkspaceState) => WorkspaceState) => void
) {
  const open = before.generating ? null : before.conversation
  const [history, saved] = await Promise.all([
    c.history.list(),
    open ? c.history.load(open.id) : Promise.resolve(null),
  ])
  if (!live()) return
  const patch = open ? savedConversationPatch(c, before, now(), saved) : {}
  update((s) => ({
    ...s,
    ...(JSON.stringify(s.history) === JSON.stringify(history) ? {} : { history }),
    ...patch,
  }))
}
