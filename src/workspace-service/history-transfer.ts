import type { ChatHistory, Conversation } from '../terminal-data/index.js'
import { AtcError } from '../errors/index.js'
import { object } from './validation.js'

export async function importConversations(history: ChatHistory, value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > 100)
    throw new AtcError('ATC_USAGE', 'Import between 1 and 100 conversations at a time.')
  const documents = value.map((entry) => {
    const data = object(entry),
      messages = data['messages']
    if (!Array.isArray(messages) || messages.length > 2000)
      throw new AtcError('ATC_USAGE', 'Each conversation needs a messages array with at most 2000 messages.')
    for (const item of messages) {
      const message = object(item)
      if (
        !['system', 'user', 'assistant', 'tool'].includes(String(message['role'])) ||
        !(
          typeof message['content'] === 'string' ||
          Array.isArray(message['content']) ||
          (message['role'] === 'assistant' && Array.isArray(message['tool_calls']))
        )
      )
        throw new AtcError('ATC_USAGE', 'Messages need a valid role and text, content parts or tool calls.')
      if (Array.isArray(message['content']))
        for (const item of message['content']) {
          const part = object(item)
          if (
            !(part['type'] === 'text' && typeof part['text'] === 'string') &&
            !(
              part['type'] === 'image_url' &&
              /^data:image\/(png|jpeg|webp|gif);base64,/.test(String(object(part['image_url'])['url']))
            )
          )
            throw new AtcError('ATC_USAGE', 'Attachments must be text or embedded PNG/JPEG/WebP/GIF images.')
        }
    }
    const chat = history.create('', String(data['model'] ?? ''), '')
    chat.title = String(data['title'] ?? data['name'] ?? 'Imported conversation').slice(0, 200)
    chat.messages = messages as Conversation['messages']
    chat.interrupted = data['interrupted'] === true
    chat.request_settings = object(data['request_settings'])
    return chat
  })
  // Validate the entire batch before saving any entry. Each imported document gets a fresh ID.
  const ids: string[] = []
  for (const chat of documents) {
    await history.save(chat)
    ids.push(chat.id)
  }
  return { imported: ids.length, ids }
}
