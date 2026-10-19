import { defineCommand } from '../cli/index.js'
import { apiStart, apiStop, apiStatus } from './terminal.js'
import { keyCommand } from './key-commands.js'
const apiOptions = {
  'port': { type: 'string', description: 'API port', placeholder: 'port' },
  'host': {
    type: 'string',
    description: 'API bind address (0.0.0.0 to expose)',
    placeholder: 'host',
  },
  'api-key': { type: 'string', description: 'Require this key on the API', placeholder: 'key' },
  'api-key-file': {
    type: 'string',
    description: 'Read the key from a file (secrets mounts)',
    placeholder: 'path',
  },
} as const

export const apiCommand = defineCommand({
  name: 'api',
  summary: 'The OpenAI-compatible API and its key',
  group: 'access',
  subcommands: [
    defineCommand({
      name: 'start',
      summary: 'Start the API, starting the daemon if needed',
      run: apiStart,
      options: {
        ...apiOptions,
        'prefix': { type: 'string', description: 'Path prefix', placeholder: '/v1' },
        'cors': { type: 'boolean', description: 'Send CORS headers', default: true },
        'trusted-host': {
          type: 'string',
          multiple: true,
          description: 'Extra Host value to accept',
          placeholder: 'host',
        },
      },
    }),
    defineCommand({ name: 'stop', summary: 'Stop the API', run: apiStop }),
    defineCommand({
      name: 'status',
      summary: 'Where the API listens and whether a key is required',
      run: apiStatus,
    }),
    keyCommand,
  ],
})
