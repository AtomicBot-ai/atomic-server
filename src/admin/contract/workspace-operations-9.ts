import type { WorkspaceOperation } from './workspace.js'
export const OPERATIONS_9: readonly WorkspaceOperation[] = [
  {
    name: 'history.list',
    title: 'Recent chats',
    group: 'history',
    description: 'Recent chats',
    mutates: false,
    effect: 'read',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'history.load',
    title: 'Open chat',
    group: 'history',
    description: 'Open chat',
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
    name: 'history.save',
    title: 'Save chat',
    group: 'history',
    description: 'Save chat',
    mutates: true,
    effect: 'configure',
    inputSchema: {
      type: 'object',
      properties: { chat: { type: 'object' } },
      required: ['chat'],
      additionalProperties: false,
    },
  },
  {
    name: 'history.remove',
    title: 'Delete chat',
    group: 'history',
    description: 'Delete chat',
    mutates: true,
    effect: 'configure',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'chat.complete',
    title: 'Chat completion',
    group: 'chat',
    description:
      'Non-streaming response with tool calls, usage, reasoning and content parts preserved. request uses the OpenAI chat schema. Request fields: model, messages, temperature, top_p, max_tokens, seed, stop, tools, tool_choice, response_format, reasoning_effort. Engine capability limits apply.',
    mutates: true,
    effect: 'generate',
    inputSchema: {
      type: 'object',
      properties: {
        request: {
          type: 'object',
          properties: {
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
          required: ['model', 'messages'],
          additionalProperties: true,
        },
        conversation_id: { type: 'string' },
      },
      required: ['request'],
      additionalProperties: false,
    },
  },
]
