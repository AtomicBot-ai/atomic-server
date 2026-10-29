import { chatBaseline } from './chat-baseline.js'
import { chatProvider } from '../cloud/chat-readiness.js'
import type { EnrichChat } from './chat-jobs.js'
import type { WorkspaceInput } from '../../contract/index.js'
import type { Conversation, ChatHistory, ClientKeys } from '../../terminal-data/index.js'
import { AtcError } from '../../errors/index.js'
import type { WorkspaceServiceOptions } from '../service-options.js'
import { object } from '../validation.js'
import { callPublic } from '../snapshot/public-api.js'
import { chatRequestFor, contextExceeded } from './chat-request.js'
import { chatAbilities } from '../models/store-variants.js'
import { publicEndpoint } from '../snapshot/snapshot.js'
export async function completeChat(
  options: WorkspaceServiceOptions,
  keys: ClientKeys,
  history: ChatHistory,
  request: typeof fetch,
  enrich: EnrichChat,
  input: WorkspaceInput
) {
  const body = object(input['request'])
  if (!Array.isArray(body['messages']) || !body['model'])
    throw new AtcError('ATC_USAGE', 'Choose a model and provide messages.')
  let chat = input['conversation_id'] ? await history.load(String(input['conversation_id'])) : null
  const expectedRevision = chatBaseline(chat, input, body['messages'] as unknown[])
  const provider = await chatProvider(options.link, String(body['model']), String(input['provider'] ?? ''))
  const { result } = await callPublic(
    options.link,
    options.config,
    keys,
    request,
    '/chat/completions',
    chatRequestFor(
      provider,
      { ...(await enrich(body)), stream: false },
      await chatAbilities(options.paths.layout, provider, String(body['model']))
    )
  ).catch((error: unknown) => {
    throw contextExceeded(provider, error instanceof Error ? error.message : String(error)) ?? error
  })
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
  await history.save(chat, expectedRevision)
  return { ...object(result), conversation_id: chat.id }
}
