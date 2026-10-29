import { useEffect } from 'react'
import type { RefObject } from 'react'
import { pollEvery } from './poll.js'
import { savedConversationPatch } from '../chat/live-conversation.js'
import type { ChatMessage } from '../../../terminal-service/index.js'
import type { WorkspaceController } from '../controller.js'
import type { WorkspaceState } from '../state.js'

const RUNNING = ['preparing', 'generating', 'stopping']

/**
 * A turn another client runs in the chat open here (the snapshot's `chats`): its reply streams in from
 * `chat.progress` beside the saved messages, and the saved reply replaces it when the turn ends.
 */
export function useOtherTurn(
  s: WorkspaceState,
  latest: RefObject<WorkspaceState>,
  controller: RefObject<WorkspaceController | undefined>,
  update: (fn: (state: WorkspaceState) => WorkspaceState) => void
) {
  const open = s.conversation?.id ?? ''
  const job = s.generating ? '' : (s.workspace?.chats?.find((j) => j.conversation_id === open)?.id ?? '')
  useEffect(() => {
    if (!open || !job) return
    let done = false
    const stop = pollEvery(
      400,
      async (live) => {
        const c = controller.current
        if (!c || done) return
        const progress = (await c.runtime.read('chat.progress', { id: job })) as Record<string, unknown>
        if (!live()) return
        if (RUNNING.includes(String(progress['state']))) {
          const message = progress['message'] as ChatMessage
          update((v) => (v.conversation?.id === open ? { ...v, otherTurn: { id: job, message } } : v))
          return
        }
        done = true
        const before = latest.current
        const saved = await c.history.load(open)
        if (!live()) return
        const patch = savedConversationPatch(c, before, latest.current, saved)
        update((v) => ({ ...v, ...patch, otherTurn: null }))
      },
      { immediately: true }
    )
    return () => {
      stop()
      update((v) => (v.otherTurn ? { ...v, otherTurn: null } : v))
    }
  }, [open, job, latest, controller, update])
}
