import type { WorkspaceOperation } from './workspace.js'
export const OPERATIONS_5: readonly WorkspaceOperation[] = [
  {
    name: 'models.import',
    title: 'Import local GGUF',
    group: 'models',
    description: 'Import local GGUF',
    mutates: true,
    effect: 'configure',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'engines.list',
    title: 'Engines and builds',
    group: 'engines',
    description: 'Engines and builds',
    mutates: false,
    effect: 'read',
    inputSchema: {
      type: 'object',
      properties: { force: { type: 'boolean' } },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'engines.catalog',
    title: 'Engine builds',
    group: 'engines',
    description: 'Engine builds',
    mutates: false,
    effect: 'read',
    inputSchema: {
      type: 'object',
      properties: { engine: { type: 'string' }, force: { type: 'boolean' } },
      required: ['engine'],
      additionalProperties: false,
    },
  },
  {
    name: 'engines.install',
    title: 'Install engine',
    group: 'engines',
    description:
      'Core selects the platform build. Managed engines may require host steps. Request fields: task_id, request_id, target, force, proxy, app_version. Engine capability limits apply.',
    mutates: true,
    effect: 'download',
    inputSchema: {
      type: 'object',
      properties: {
        engine: { type: 'string' },
        request: {
          type: 'object',
          properties: {
            task_id: {},
            request_id: {},
            target: { type: 'object' },
            force: { type: 'boolean' },
            proxy: { type: 'object' },
            app_version: {},
          },
          required: [],
          additionalProperties: true,
        },
      },
      required: ['engine'],
      additionalProperties: false,
    },
  },
  {
    name: 'engines.activate',
    title: 'Activate engine build',
    group: 'engines',
    description: 'Activate engine build',
    mutates: true,
    effect: 'configure',
    inputSchema: {
      type: 'object',
      properties: { engine: { type: 'string' }, version: { type: 'string' }, variant: { type: 'string' } },
      required: ['engine', 'version', 'variant'],
      additionalProperties: false,
    },
  },
]
