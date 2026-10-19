import type { WorkspaceInput } from '../contract/index.js'
import type { Conversation, ChatHistory, ClientKeys } from '../terminal-data/index.js'
import { AtcError } from '../errors/index.js'
import type { WorkspaceServiceOptions } from './service.js'
import { object } from './validation.js'
import { callPublic } from './public-api.js'
import { publicEndpoint } from './snapshot.js'
export async function completeChat(
  options: WorkspaceServiceOptions,
  keys: ClientKeys,
  history: ChatHistory,
  request: typeof fetch,
  input: WorkspaceInput
) {
  const body = object(input['request'])
  if (!Array.isArray(body['messages']) || !body['model'])
    throw new AtcError('ATC_USAGE', 'Choose a model and provide messages.')
  const { result } = await callPublic(options.link, options.config, keys, request, '/chat/completions', {
    ...body,
    stream: false,
  })
  let chat = input['conversation_id'] ? await history.load(String(input['conversation_id'])) : null
  chat ??= history.create(
    publicEndpoint(object(await options.link.server.status()), options.config).endpoint,
    String(body['model']),
    ''
  )
  const message = object(
    (object(result)['choices'] as Record<string, unknown>[] | undefined)?.[0]?.['message']
  )
  chat.messages = [
    ...body['messages'],
    ...(Object.keys(message).length ? [message] : []),
  ] as Conversation['messages']
  const first = object(body['messages'].find((m) => object(m)['role'] === 'user'))['content']
  chat.title = typeof first === 'string' ? first.slice(0, 70) : 'Media chat'
  chat.model = String(body['model'])
  chat.interrupted = false
  await history.save(chat)
  return { ...object(result), conversation_id: chat.id }
}
