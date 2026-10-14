import type { WorkspaceOperation } from './workspace.js'
export const OPERATIONS_6: readonly WorkspaceOperation[] = [
  {
    name: 'engines.remove',
    title: 'Remove engine build',
    group: 'engines',
    description: 'Remove engine build',
    mutates: true,
    effect: 'configure',
    inputSchema: {
      type: 'object',
      properties: { engine: { type: 'string' }, version: { type: 'string' }, variant: { type: 'string' } },
      required: ['engine', 'version', 'variant'],
      additionalProperties: false,
    },
  },
  {
    name: 'setup.status',
    title: 'Setup progress',
    group: 'setup',
    description: 'Setup progress',
    mutates: false,
    effect: 'read',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'setup.manual',
    title: 'Set up manually',
    group: 'setup',
    description: 'Set up manually',
    mutates: true,
    effect: 'configure',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'setup.complete',
    title: 'Finish setup',
    group: 'setup',
    description: 'Verify the selected loaded workload, then save setup completion',
    mutates: true,
    effect: 'configure',
    inputSchema: {
      type: 'object',
      properties: {
        model_id: {
          type: 'string',
          description: 'Model to verify; required when adding a workload alongside existing models',
        },
        service_id: { type: 'string', description: 'Optional loaded service ID to verify' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'setup.resume',
    title: 'Resume installation',
    group: 'setup',
    description: 'Resume installation',
    mutates: true,
    effect: 'download',
    inputSchema: {
      type: 'object',
      properties: { setup_id: { type: 'string' } },
      required: ['setup_id'],
      additionalProperties: false,
    },
  },
]
