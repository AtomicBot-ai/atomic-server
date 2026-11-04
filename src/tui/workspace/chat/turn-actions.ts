import type { RefObject } from 'react'
import type { WorkspaceController, WorkspaceDeps } from '../controller.js'
import type { WorkspaceState } from '../state.js'
import { oneLine } from '../../controller.js'
import { captureFailure } from '../../../telemetry/index.js'
import { messageText, type ChatMessage } from '../../../terminal-service/index.js'
import { readinessPatch } from './readiness.js'
import { failedTurn } from './failed-turn.js'
import { chatFeatureRequest } from './features.js'
import { chosenEndpoint } from './model-selection.js'
import { markSynced } from './live-conversation.js'

/** Keep the active turn owned until its saved result arrives; navigation can abandon only its display. */
export function turnActions(
  latest: RefObject<WorkspaceState>,
  controller: RefObject<WorkspaceController | undefined>,
  epoch: RefObject<number>,
  update: (fn: (state: WorkspaceState) => WorkspaceState) => void,
  errors: WorkspaceDeps['base']['errors']
) {
  const patch = (part: Partial<WorkspaceState>) => update((s) => ({ ...s, ...part }))
  function cancel(abandon = false) {
    if (!latest.current.generating) return
    if (abandon) {
      epoch.current++
      controller.current?.cancel()
      patch({ generating: false, stopping: false, message: '' })
    } else if (!latest.current.stopping) {
      controller.current?.cancel()
      patch({ stopping: true, message: 'Stopping response…' })
    }
  }
  function send() {
    const s = latest.current,
      c = controller.current
    if (
      !c ||
      s.generating ||
      (!s.draft.trim() && !s.images.length && !s.documents?.length && s.messages.at(-1)?.role !== 'tool')
    )
      return
    const blocked = readinessPatch(s)
    if (blocked) {
      patch(blocked)
      return
    }
    const message: ChatMessage = {
      role: 'user',
      content: s.images.length
        ? [
            { type: 'text', text: s.draft.trim() },
            ...s.images.map((image) => ({ type: 'image_url' as const, image_url: { url: image.url } })),
          ]
        : s.draft.trim(),
    }
    const messages =
        s.draft.trim() || s.images.length || s.documents?.length ? [...s.messages, message] : s.messages,
      id = ++epoch.current
    patch({
      conversation: s.conversation ?? {
        ...c.history.create(chosenEndpoint(s) ?? '', s.model, process.cwd()),
        title: s.draft.trim().replace(/\s+/g, ' ').slice(0, 70),
      },
      messages: [...messages, { role: 'assistant', content: '' }],
      draft: '',
      images: [],
      documents: [],
      cursor: 0,
      generating: true,
      stopping: false,
      message: '',
      scroll: 0,
    })
    void c
      .chat(
        chosenEndpoint(s),
        s.model,
        messages,
        (token) => {
          if (epoch.current === id)
            update((v) => ({
              ...v,
              messages: v.messages.map((m, i) =>
                i === v.messages.length - 1 ? { ...m, content: messageText(m.content) + token } : m
              ),
            }))
        },
        chatFeatureRequest(s),
        s.conversation?.id,
        s.documents,
        s.conversation?.revision
      )
      .then(async (response) => {
        // A terminal state is published only after the server saves the answer. Adopt that exact
        // copy, including its ID, revision and interrupted flag, before enabling local autosaves.
        const saved = response ? await c.history.load(response.conversation_id) : null
        if (epoch.current !== id) return
        if (saved) markSynced(c, saved)
        update((v) => ({
          ...v,
          generating: false,
          stopping: false,
          message: v.stopping || response?.stopped ? 'Response stopped.' : v.message,
          messages:
            saved?.messages ??
            (response ? [...(response.messages ?? v.messages.slice(0, -1)), response.message] : v.messages),
          conversation:
            saved ??
            (v.conversation
              ? {
                  ...v.conversation,
                  ...(response ? { id: response.conversation_id, revision: response.revision } : {}),
                  interrupted: v.stopping || response?.stopped || false,
                  request_settings: chatFeatureRequest(s),
                }
              : null),
          ...(!response?.stopped && response?.message.tool_calls?.length
            ? { overlay: 'chat-tools', focus: 'chat-tools-approve' }
            : {}),
        }))
      })
      .catch((e) => {
        captureFailure(errors, e, { component: 'tui', operation: 'chat.send' })
        if (epoch.current === id) patch(failedTurn(latest.current, s, oneLine(e)))
      })
  }
  return { send, cancel }
}
