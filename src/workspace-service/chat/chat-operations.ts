/** The workspace's chat operations: history and generation jobs; `NOT_CORE` for any other. */

import { AtcError } from '../../errors/index.js'
import type { ChatHistory, ClientKeys, Conversation } from '../../terminal-data/index.js'
import type { WorkspaceInput } from '../../contract/index.js'
import type { WorkspaceServiceOptions } from '../service-options.js'
import { object } from '../validation.js'
import { completeChat } from './chat-complete.js'
import type { ChatJobs, EnrichChat } from './chat-jobs.js'
import { importConversations } from './history-transfer.js'
import { NOT_CORE } from '../not-core.js'

export interface ChatParts {
  options: WorkspaceServiceOptions
  keys: ClientKeys
  history: ChatHistory
  chats: Pick<ChatJobs, 'start' | 'get' | 'cancel'>
  request: typeof fetch
  enrich: EnrichChat
}

export async function chatOperation(
  { options, keys, history, chats, request, enrich }: ChatParts,
  operation: string,
  input: WorkspaceInput
) {
  switch (operation) {
    case 'history.list':
      return history.list()
    case 'history.load':
      return history.load(String(input['id']))
    case 'history.remove':
      await history.remove(String(input['id']))
      return { removed: true }
    case 'history.save': {
      const chat = object(input['chat'])
      if (!Array.isArray(chat['messages']) || typeof chat['id'] !== 'string')
        throw new AtcError('ATC_USAGE', 'A chat needs id and messages.')
      await history.save(
        chat as unknown as Conversation,
        Number(input['expected_revision'] ?? chat['revision'] ?? 0)
      )
      return { saved: true, chat }
    }
    case 'chat.start':
      return chats.start(input)
    case 'chat.progress':
      return chats.get(String(input['id']))
    case 'chat.cancel':
      return chats.cancel(String(input['id']))
    case 'history.import':
      return importConversations(history, input['conversations'])
    case 'chat.complete':
      return completeChat(options, keys, history, request, enrich, input)
  }
  return NOT_CORE
}
