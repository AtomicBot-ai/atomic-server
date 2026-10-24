import type { ChatMessage } from '../../../terminal-service/index.js'
import type { WorkspaceRuntime } from '../runtime.js'
export async function sharedChat(
  runtime: WorkspaceRuntime,
  model: string,
  messages: ChatMessage[],
  preferences: Record<string, unknown>,
  signal: AbortSignal,
  onText: (text: string) => void,
  conversationId?: string,
  documents: { name: string; text: string }[] = []
) {
  const { atomic_system, ...requestPreferences } = preferences
  if (typeof atomic_system === 'string')
    messages = [
      ...(atomic_system ? [{ role: 'system' as const, content: atomic_system }] : []),
      ...messages.filter((m) => m.role !== 'system'),
    ]
  const prepared = await Promise.all(
    documents.map(
      (doc) =>
        runtime.read('attachments.prepare', {
          name: doc.name,
          content: doc.text,
          query: typeof messages.at(-1)?.content === 'string' ? messages.at(-1)?.content : '',
        }) as Promise<{ content: string }>
    )
  )
  if (prepared.length) {
    messages = structuredClone(messages)
    const last = messages.at(-1)!
    const addition = prepared
      .map((doc, i) => `\nAttached file: ${documents[i]!.name}\n${doc.content}`)
      .join('\n')
    if (typeof last.content === 'string') last.content += addition
    else last.content.push({ type: 'text', text: addition })
  }
  const initial = (await runtime.read('chat.start', {
    request: { ...requestPreferences, model, messages },
    ...(conversationId ? { conversation_id: conversationId } : {}),
  })) as Record<string, unknown>
  const id = String(initial['id'])
  let job = initial,
    shown = ''
  const cancel = () => {
    void runtime.read('chat.cancel', { id }).catch(() => {})
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    while (true) {
      if (signal.aborted) {
        cancel()
        return undefined
      }
      const message = job['message'] as ChatMessage,
        content = typeof message?.content === 'string' ? message.content : ''
      if (content.startsWith(shown)) {
        onText(content.slice(shown.length))
        shown = content
      }
      if (!['preparing', 'generating', 'stopping'].includes(String(job['state']))) {
        if (job['error']) throw new Error(String(job['error']))
        return { message, conversation_id: String(job['conversation_id']), messages }
      }
      await new Promise((resolve) => setTimeout(resolve, 150))
      job = (await runtime.read('chat.progress', { id })) as Record<string, unknown>
    }
  } finally {
    signal.removeEventListener('abort', cancel)
  }
}
