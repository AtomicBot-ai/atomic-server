import type { WorkspaceOperation } from './workspace.js'
export const OPERATIONS_0: readonly WorkspaceOperation[] = [
  {
    name: 'operations.list',
    title: 'Available commands',
    group: 'operations',
    description: 'Available commands',
    mutates: false,
    effect: 'read',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'api.start',
    title: 'Start API',
    group: 'api',
    description:
      'Start API Request fields: host, port, prefix, trusted_hosts, proxy_timeout_secs. Engine capability limits apply.',
    mutates: true,
    effect: 'configure',
    inputSchema: {
      type: 'object',
      properties: {
        request: {
          type: 'object',
          properties: {
            host: {},
            port: { type: 'integer', minimum: 0, maximum: 65535 },
            prefix: {},
            trusted_hosts: { type: 'array', items: {} },
            proxy_timeout_secs: { type: 'integer', minimum: 1 },
          },
          required: [],
          additionalProperties: true,
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'api.stop',
    title: 'Stop API',
    group: 'api',
    description: 'Stops active HTTP connections; loaded models stay resident.',
    mutates: true,
    effect: 'interrupt',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'api.restart',
    title: 'Restart API',
    group: 'api',
    description:
      'Stops active HTTP connections; loaded models stay resident. Request fields: host, port, prefix, trusted_hosts, proxy_timeout_secs. Engine capability limits apply.',
    mutates: true,
    effect: 'interrupt',
    inputSchema: {
      type: 'object',
      properties: {
        request: {
          type: 'object',
          properties: {
            host: {},
            port: { type: 'integer', minimum: 0, maximum: 65535 },
            prefix: {},
            trusted_hosts: { type: 'array', items: {} },
            proxy_timeout_secs: { type: 'integer', minimum: 1 },
          },
          required: [],
          additionalProperties: true,
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'api.ping',
    title: 'Ping API',
    group: 'api',
    description: 'Ping API',
    mutates: false,
    effect: 'read',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
]
