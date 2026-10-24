import { operation } from './define.js'
/** Cloud connections use the core's credential store; read views never include saved API keys. */
export const CLOUD_OPERATIONS = [
  operation(
    'cloud.connect',
    'Check and connect provider',
    'secret',
    'Check an OpenAI-compatible provider, discover its model IDs when models is empty, then save the connection. Supply the API key again when checking an existing protected provider; the saved key is never read back.',
    {
      properties: {
        provider: { type: 'string' },
        base_url: { type: 'string' },
        api_key: { type: 'string' },
        models: { type: 'array', items: { type: 'string' } },
      },
      required: ['provider', 'base_url', 'models'],
    }
  ),
  operation(
    'cloud.list',
    'Cloud providers',
    'read',
    'List registered cloud providers, their model IDs and whether a key is saved; never returns the key.'
  ),
  operation(
    'cloud.save',
    'Connect provider',
    'secret',
    'Register a cloud provider and its model IDs; the core stores its API key separately from settings. Omit api_key to retain the saved key.',
    {
      properties: {
        provider: { type: 'string' },
        base_url: { type: 'string' },
        api_key: { type: 'string' },
        models: { type: 'array', items: { type: 'string' } },
      },
      required: ['provider', 'base_url', 'models'],
    }
  ),
  operation(
    'cloud.remove',
    'Disconnect provider',
    'configure',
    'Remove a cloud provider registration and its saved credential from this server.',
    {
      properties: { provider: { type: 'string' } },
      required: ['provider'],
    }
  ),
] as const
