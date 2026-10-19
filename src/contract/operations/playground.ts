import type { WorkspaceOperation } from '../workspace.js'
import { operation, request } from './define.js'

/** Playground chat: server-owned generation jobs and conversation history. */
export const PLAYGROUND_OPERATIONS: readonly WorkspaceOperation[] = [
  operation(
    'history.list',
    'Recent chats',
    'read',
    'List saved chat conversations, most recent activity first.'
  ),
  operation('history.load', 'Open chat', 'read', 'Load one saved conversation with its messages.', {
    properties: { id: { type: 'string' } },
    required: ['id'],
  }),
  operation(
    'history.save',
    'Save chat',
    'configure',
    'Save a conversation (id and messages), replacing the stored copy.',
    { properties: { chat: { type: 'object' } }, required: ['chat'] }
  ),
  operation('history.remove', 'Delete chat', 'configure', 'Delete a saved conversation.', {
    properties: { id: { type: 'string' } },
    required: ['id'],
  }),
  operation(
    'chat.complete',
    'Chat completion',
    'generate',
    'Run one chat completion and return the whole response; tool calls, usage, reasoning and content parts are preserved. request uses the OpenAI chat schema. Engine capability limits apply.',
    {
      properties: {
        request: request(
          {
            model: {},
            messages: {
              type: 'array',
              description:
                'Messages with system/user/assistant/tool roles. Content can be text or image_url parts.',
              items: { type: 'object' },
            },
            temperature: { type: 'number' },
            top_p: { type: 'number' },
            max_tokens: { type: 'integer', minimum: 1 },
            seed: { type: 'integer' },
            stop: { items: {} },
            tools: { type: 'array', items: { type: 'object' } },
            tool_choice: {},
            response_format: { type: 'object' },
            reasoning_effort: {},
          },
          ['model', 'messages']
        ),
        conversation_id: { type: 'string' },
      },
      required: ['request'],
    }
  ),
  operation(
    'chat.start',
    'Stream a Playground response',
    'generate',
    'Start a cancellable chat request as a server-owned job. Read chat.progress at least once per minute to keep it active.',
    {
      properties: {
        request: { type: 'object' },
        provider: { type: 'string' },
        conversation_id: { type: 'string' },
      },
      required: ['request'],
    }
  ),
  operation(
    'chat.progress',
    'Read response progress',
    'read',
    "Read a started chat's streamed text, reasoning, tool calls and usage.",
    { properties: { id: { type: 'string' } }, required: ['id'] }
  ),
  operation(
    'chat.cancel',
    'Stop response',
    'interrupt',
    'Abort the upstream request and save the partial response.',
    { properties: { id: { type: 'string' } }, required: ['id'] }
  ),
  operation(
    'history.import',
    'Import conversations',
    'configure',
    'Validate and merge conversations using new IDs; never replace existing history.',
    {
      properties: { conversations: { type: 'array', items: { type: 'object' } } },
      required: ['conversations'],
    }
  ),
]
