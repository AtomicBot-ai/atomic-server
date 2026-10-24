import { operation } from './define.js'
const id = { properties: { id: { type: 'string' as const } }, required: ['id'] }
const value = { properties: { value: { type: 'object' as const } }, required: ['value'] }
export const FEATURE_OPERATIONS = [
  operation(
    'connectors.import',
    'Save connector JSON',
    'configure',
    'Validate and atomically replace MCP connectors from mcpServers JSON.',
    value
  ),
  operation(
    'features.get',
    'Workspace settings',
    'read',
    'Read shared assistants, skills, connectors and attachment preferences.'
  ),
  operation(
    'assistants.save',
    'Save assistant',
    'configure',
    'Create or update an assistant and its system prompt and sampling parameters.',
    value
  ),
  operation(
    'assistants.remove',
    'Delete assistant',
    'configure',
    'Delete an assistant and reset the default if necessary.',
    id
  ),
  operation(
    'assistants.default',
    'Default assistant',
    'configure',
    'Choose the assistant used for new conversations.',
    id
  ),
  operation('skills.save', 'Save skill', 'configure', 'Create or update named skill instructions.', value),
  operation(
    'skills.remove',
    'Delete skill',
    'configure',
    'Delete saved skill instructions and resources.',
    id
  ),
  operation('skills.toggle', 'Enable skill', 'configure', 'Enable or disable a skill.', {
    properties: { id: { type: 'string' }, enabled: { type: 'boolean' } },
    required: ['id', 'enabled'],
  }),
  operation(
    'skills.import',
    'Import skill',
    'configure',
    'Import SKILL.md text or a base64 .skill archive with its resources.',
    { properties: { content: { type: 'string' }, data: { type: 'string' } } }
  ),
  operation(
    'skills.export',
    'Export skill',
    'read',
    'Export skill instructions as a portable SKILL.md file.',
    id
  ),
  operation(
    'connectors.oauth.start',
    'Sign in to connector',
    'configure',
    'Start a browser OAuth sign-in with PKCE; credentials stay on the server.',
    { properties: { id: { type: 'string' }, client_id: { type: 'string' } }, required: ['id'] }
  ),
  operation(
    'connectors.oauth.status',
    'Read connector sign-in',
    'read',
    'Read sign-in progress without exposing credentials.',
    id
  ),
  operation(
    'connectors.oauth.cancel',
    'Cancel connector sign-in',
    'interrupt',
    'Close a pending sign-in and its callback listener.',
    id
  ),
  operation(
    'connectors.oauth.logout',
    'Sign out of connector',
    'configure',
    'Remove stored OAuth credentials for this connector.',
    id
  ),
  operation(
    'connectors.save',
    'Save connector',
    'configure',
    'Save an MCP HTTP or stdio connection. No command runs until connection is requested.',
    value
  ),
  operation('connectors.remove', 'Remove connector', 'configure', 'Delete an MCP connector.', id),
  operation(
    'connectors.check',
    'Connect MCP',
    'configure',
    'Initialize an MCP connection and read its tools. For stdio this launches the saved command.',
    id
  ),
  operation(
    'connectors.call',
    'Run MCP tool',
    'generate',
    'Run one explicitly selected MCP tool with supplied arguments.',
    {
      properties: { id: { type: 'string' }, tool: { type: 'string' }, arguments: { type: 'object' } },
      required: ['id', 'tool', 'arguments'],
    }
  ),
  operation(
    'attachments.update',
    'Attachment settings',
    'configure',
    'Save shared document processing and image size settings.',
    value
  ),
  operation(
    'attachments.parse',
    'Read document',
    'read',
    'Extract bounded text from an uploaded PDF, Office or text document.',
    { properties: { name: { type: 'string' }, data: { type: 'string' } }, required: ['name', 'data'] }
  ),
  operation(
    'attachments.prepare',
    'Prepare document',
    'read',
    'Apply document limits and extract relevant text chunks for the current prompt.',
    {
      properties: { name: { type: 'string' }, content: { type: 'string' }, query: { type: 'string' } },
      required: ['name', 'content'],
    }
  ),
]
