import type { WorkspaceOperation } from './workspace.js'
export const OPERATIONS_20: readonly WorkspaceOperation[] = [
  {
    name: 'chat.start',
    title: 'Stream a Playground response',
    group: 'chat',
    description:
      'Starts a cancellable request. Read chat.progress at least once per minute to keep it active.',
    mutates: true,
    effect: 'generate',
    inputSchema: {
      type: 'object',
      properties: {
        request: { type: 'object' },
        provider: { type: 'string' },
        conversation_id: { type: 'string' },
      },
      required: ['request'],
      additionalProperties: false,
    },
  },
  {
    name: 'chat.progress',
    title: 'Read response progress',
    group: 'chat',
    description: 'Read streamed text, reasoning, tool calls and usage.',
    mutates: false,
    effect: 'read',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'chat.cancel',
    title: 'Stop response',
    group: 'chat',
    description: 'Abort the upstream request and save the partial response.',
    mutates: true,
    effect: 'interrupt',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'history.import',
    title: 'Import conversations',
    group: 'history',
    description: 'Validate and merge conversations using new IDs; never replace existing history.',
    mutates: true,
    effect: 'configure',
    inputSchema: {
      type: 'object',
      properties: { conversations: { type: 'array', items: { type: 'object' } } },
      required: ['conversations'],
      additionalProperties: false,
    },
  },
]
