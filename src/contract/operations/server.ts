import type { WorkspaceOperation } from '../workspace.js'
import { operation, request } from './define.js'

/** Listener settings for api.start and api.restart. */
const LISTENER_REQUEST = request({
  host: {},
  port: { type: 'integer', minimum: 0, maximum: 65535 },
  prefix: {},
  trusted_hosts: { type: 'array', items: {} },
  proxy_timeout_secs: { type: 'integer', minimum: 1 },
})

/** Server page: listener, connection details, client keys, configuration, diagnostics and remote access. */
export const SERVER_OPERATIONS: readonly WorkspaceOperation[] = [
  operation(
    'operations.list',
    'Available commands',
    'read',
    'List every workspace operation with its effect and input schema.'
  ),
  operation(
    'api.start',
    'Start API',
    'configure',
    'Start the OpenAI-compatible API listener. The optional request overrides host, port, prefix, trusted hosts and the proxy timeout. Engine capability limits apply.',
    { properties: { request: LISTENER_REQUEST } }
  ),
  operation(
    'api.stop',
    'Stop API',
    'interrupt',
    'Stop the API listener. Active HTTP connections close; loaded models stay resident.'
  ),
  operation(
    'api.restart',
    'Restart API',
    'interrupt',
    'Restart the API listener, optionally with new listener settings. Active HTTP connections close; loaded models stay resident. Engine capability limits apply.',
    { properties: { request: LISTENER_REQUEST } }
  ),
  operation(
    'api.ping',
    'Ping API',
    'read',
    'Call the public /models endpoint with a client key and report the latency and the models it lists.'
  ),
  operation(
    'api.inspector',
    'Detailed request metrics',
    'configure',
    'Turn request inspection on or off. While it is on, Core captures prompt and reply previews; the workspace keeps only timing and token counts.',
    { properties: { enabled: { type: 'boolean' } }, required: ['enabled'] }
  ),
  operation(
    'connection.info',
    'Connection details',
    'read',
    'Read the public API endpoint, the client keys (masked) and the agents that can be connected.'
  ),
  operation(
    'connection.agents',
    'Agent connections',
    'read',
    'List the coding agents atc can configure to use this server.'
  ),
  operation(
    'connection.profile',
    'Prepare agent connection',
    'secret',
    'Build the profile an agent needs to use this server: endpoint, model, client key and launch command. Needs a running API, an existing key and a loaded chat model. The result contains the key.',
    {
      properties: {
        agent: { type: 'string', enum: ['atomic-agent', 'claude', 'codex', 'opencode'] },
        model: { type: 'string' },
        key_id: { type: 'string' },
      },
      required: ['agent', 'model'],
    },
    { mutates: false }
  ),
  operation('keys.list', 'API keys', 'read', 'List client API keys by ID, name and masked preview.'),
  operation(
    'keys.create',
    'Create API key',
    'secret',
    'Create a named client API key. The result contains the key.',
    { properties: { name: { type: 'string' } }, required: ['name'] }
  ),
  operation(
    'keys.reveal',
    'Copy API key',
    'secret',
    'Return the full value of an existing client API key.',
    { properties: { id: { type: 'string' } } },
    { mutates: false }
  ),
  operation(
    'keys.revoke',
    'Revoke API key',
    'configure',
    'Revoke a client API key; requests that use it are refused from then on.',
    { properties: { id: { type: 'string' } }, required: ['id'] }
  ),
  operation(
    'config.get',
    'Server configuration',
    'read',
    'Read the effective atc configuration and the command prefix that targets this data folder.'
  ),
  operation(
    'config.update',
    'Save server configuration',
    'configure',
    'Change atc configuration fields; values are validated against the config schema.',
    { properties: { values: { type: 'object' } }, required: ['values'] }
  ),
  operation(
    'logs.read',
    'Server logs',
    'read',
    'Read the last lines of the server log (150 by default), with API keys and bearer tokens redacted.',
    { properties: { lines: { type: 'integer', minimum: 1, maximum: 1000 } } }
  ),
  operation(
    'remote.status',
    'Remote access',
    'read',
    'Read whether remote access to the API is on and where it listens.'
  ),
  operation(
    'remote.addresses',
    'LAN addresses',
    'read',
    "List this machine's LAN addresses that remote clients can reach."
  ),
  operation(
    'remote.start',
    'Start remote access',
    'configure',
    'Open the API to remote clients beyond loopback.',
    { properties: { request: { type: 'object' } }, required: ['request'] }
  ),
  operation('remote.stop', 'Stop remote access', 'interrupt', 'Stop remote access to the API.'),
]
