import type { WorkspaceOperation } from './workspace.js'
export const OPERATIONS_15: readonly WorkspaceOperation[] = [
  {
    name: 'media.decision.run',
    title: 'Decision Run',
    group: 'media',
    description:
      'Decision Run Request fields: state, questions, truncation, timeout_ms. Engine capability limits apply.',
    mutates: true,
    effect: 'generate',
    inputSchema: {
      type: 'object',
      properties: {
        request: {
          type: 'object',
          properties: {
            state: {},
            questions: { type: 'object' },
            truncation: { type: 'string', enum: ['allow', 'error'] },
            timeout_ms: { type: 'integer', minimum: 1 },
          },
          required: ['state', 'questions'],
          additionalProperties: true,
        },
      },
      required: ['request'],
      additionalProperties: false,
    },
  },
  {
    name: 'media.router.run',
    title: 'Router Run',
    group: 'media',
    description:
      'Router Run Request fields: task, criterion, candidates, timeout_ms. Engine capability limits apply.',
    mutates: true,
    effect: 'generate',
    inputSchema: {
      type: 'object',
      properties: {
        request: {
          type: 'object',
          properties: {
            task: {},
            criterion: {},
            candidates: { type: 'array', items: { type: 'object' } },
            timeout_ms: { type: 'integer', minimum: 1 },
          },
          required: ['task', 'candidates'],
          additionalProperties: true,
        },
      },
      required: ['request'],
      additionalProperties: false,
    },
  },
  {
    name: 'media.embedding.status',
    title: 'Embedding status',
    group: 'media',
    description: 'Embedding status',
    mutates: false,
    effect: 'read',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'media.embedding.config',
    title: 'Embedding settings',
    group: 'media',
    description: 'Embedding settings',
    mutates: false,
    effect: 'read',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'media.decision.status',
    title: 'Decision status',
    group: 'media',
    description: 'Decision status',
    mutates: false,
    effect: 'read',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
]
