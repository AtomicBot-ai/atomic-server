import type { WorkspaceFeatures } from '../../../contract/index.js'
import { DEFAULT_ASSISTANT, DEFAULT_ATTACHMENTS } from '../../../contract/index.js'
import type { WorkspaceState } from '../state.js'
import { CHAT_PARAMETER_FIELDS } from '../chat/parameter-values.js'
export interface FeatureEditor {
  kind:
    | 'assistants'
    | 'connectors'
    | 'skills'
    | 'attachments'
    | 'import'
    | 'export'
    | 'skill-menu'
    | 'skill-create-menu'
    | 'assistant-default'
    | 'connector-json'
    | 'connector-secret'
    | 'connector-menu'
    | 'connector-tools'
    | 'connector-oauth'
    | 'connector-oauth-client'
    | 'chat-parameters'
  value: Record<string, string>
}
export function featureData(s: WorkspaceState): WorkspaceFeatures {
  return (
    s.workspace?.features ?? {
      assistants: [DEFAULT_ASSISTANT],
      default_assistant: DEFAULT_ASSISTANT.id,
      skills: [],
      connectors: [],
      connector_status: {},
      attachments: DEFAULT_ATTACHMENTS,
    }
  )
}
export function featureFields(editor: FeatureEditor): [string, string][] {
  if (editor.kind === 'chat-parameters') return CHAT_PARAMETER_FIELDS
  if (['skill-menu', 'skill-create-menu', 'assistant-default'].includes(editor.kind)) return []
  if (editor.kind === 'connector-json') return [['content', 'Configuration (JSON)']]
  if (editor.kind === 'connector-secret') return [['secret', editor.value['label'] ?? 'API key']]
  if (editor.kind === 'connector-oauth-client') return [['client_id', 'OAuth client ID (optional)']]
  if (editor.kind.startsWith('connector-')) return []
  if (editor.kind === 'export') return [['path', 'Save .skill file to']]
  if (editor.kind === 'import')
    return [
      ['path', 'SKILL.md or .skill file path'],
      ['content', 'Or paste SKILL.md content'],
    ]
  if (editor.kind === 'attachments')
    return [
      ['enabled', 'Document attachments (true/false)'],
      ['max_file_size_mb', 'Maximum file size (MB)'],
      ['retrieval_limit', 'Retrieval limit'],
      ['retrieval_threshold', 'Retrieval threshold'],
      ['chunk_size_chars', 'Chunk size'],
      ['overlap_chars', 'Chunk overlap'],
      ['parse_mode', 'Parse mode (auto/inline/embeddings/retrieval)'],
      ['embedding_model', 'Embedding model (blank = automatic)'],
      ['search_mode', 'Search mode (auto/linear)'],
      ['auto_inline_context_ratio', 'Automatic inline context ratio'],
      ['max_image_size_px', 'Maximum image size (px; 0 = original)'],
    ]
  if (editor.kind === 'assistants')
    return [
      ['name', 'Name'],
      ['avatar', 'Avatar'],
      ['description', 'Description'],
      ['instructions', 'Instructions'],
      ['parameters', 'Sampling parameters (JSON)'],
    ]
  if (editor.kind === 'skills')
    return [
      ['name', 'Name'],
      ['description', 'Description'],
      ['body', 'Instructions'],
      ['enabled', 'Enabled (true/false)'],
    ]
  return [
    ['name', 'Name'],
    ['type', 'Transport (http/sse/stdio)'],
    ...((editor.value['type'] === 'stdio'
      ? [
          ['command', 'Command'],
          ['args', 'Arguments (JSON)'],
          ['env', 'Environment (JSON)'],
        ]
      : [
          ['url', 'MCP URL'],
          ['headers', 'Headers (JSON)'],
        ]) as [string, string][]),
    ['timeout', 'Tool call timeout (seconds)'],
    ['enabled', 'Enabled (true/false)'],
  ]
}
export function editorValue(editor: FeatureEditor) {
  const value: Record<string, unknown> = { ...editor.value }
  for (const key of ['parameters', 'args', 'env', 'headers'])
    if (typeof value[key] === 'string') value[key] = JSON.parse(value[key] || (key === 'args' ? '[]' : '{}'))
  for (const key of [
    'timeout',
    'max_file_size_mb',
    'retrieval_limit',
    'retrieval_threshold',
    'chunk_size_chars',
    'overlap_chars',
    'max_image_size_px',
    'auto_inline_context_ratio',
  ])
    if (value[key] !== undefined) value[key] = Number(value[key])
  if (value['enabled'] !== undefined) value['enabled'] = value['enabled'] !== 'false'
  return value
}
export function featureDraft(kind: FeatureEditor['kind'], value: object): FeatureEditor {
  return {
    kind,
    value: Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])
    ),
  }
}
