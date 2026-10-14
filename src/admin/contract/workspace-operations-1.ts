import type { WorkspaceOperation } from './workspace.js'
export const OPERATIONS_1: readonly WorkspaceOperation[] = [
  {
    name: 'api.inspector',
    title: 'Detailed request metrics',
    group: 'api',
    description:
      'Core captures prompt/reply previews while enabled. The workspace retains timing and token counts only.',
    mutates: true,
    effect: 'configure',
    inputSchema: {
      type: 'object',
      properties: { enabled: { type: 'boolean' } },
      required: ['enabled'],
      additionalProperties: false,
    },
  },
  {
    name: 'connection.info',
    title: 'Connection details',
    group: 'connection',
    description: 'Connection details',
    mutates: false,
    effect: 'read',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'connection.agents',
    title: 'Agent connections',
    group: 'connection',
    description: 'Agent connections',
    mutates: false,
    effect: 'read',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'connection.profile',
    title: 'Prepare agent connection',
    group: 'connection',
    description: 'Prepare agent connection',
    mutates: false,
    effect: 'secret',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', enum: ['atomic-agent', 'claude', 'codex', 'opencode'] },
        model: { type: 'string' },
        key_id: { type: 'string' },
      },
      required: ['agent', 'model'],
      additionalProperties: false,
    },
  },
  {
    name: 'keys.list',
    title: 'API keys',
    group: 'keys',
    description: 'API keys',
    mutates: false,
    effect: 'read',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
]
