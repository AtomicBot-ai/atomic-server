import type { WorkspaceOperation } from './workspace.js'
export const OPERATIONS_19: readonly WorkspaceOperation[] = [
  {
    name: 'remote.start',
    title: 'Start remote access',
    group: 'remote',
    description: 'Start remote access',
    mutates: true,
    effect: 'configure',
    inputSchema: {
      type: 'object',
      properties: { request: { type: 'object' } },
      required: ['request'],
      additionalProperties: false,
    },
  },
  {
    name: 'remote.stop',
    title: 'Stop remote access',
    group: 'remote',
    description: 'Stop remote access',
    mutates: true,
    effect: 'interrupt',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
]
