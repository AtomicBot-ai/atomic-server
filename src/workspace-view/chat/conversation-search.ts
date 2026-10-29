interface Message {
  content?: unknown
  reasoning_content?: unknown
}
/** Search user-visible text, including text parts and reasoning, without JSON keys or image data. */
export function conversationSearchText(chat: { title?: unknown; messages?: unknown }): string {
  const messages = Array.isArray(chat.messages) ? (chat.messages as Message[]) : []
  return [
    typeof chat.title === 'string' ? chat.title : '',
    ...messages.map((m) =>
      [
        typeof m?.content === 'string'
          ? m.content
          : Array.isArray(m?.content)
            ? m.content
                .map((part) => (part?.type === 'text' && typeof part.text === 'string' ? part.text : ''))
                .join('\n')
            : '',
        typeof m?.reasoning_content === 'string' ? m.reasoning_content : '',
      ].join('\n')
    ),
  ].join('\n')
}
