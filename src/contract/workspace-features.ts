/** Desktop workspace features share server-owned documents across both frontends. */
export interface AssistantProfile {
  id: string
  name: string
  avatar: string
  description: string
  instructions: string
  parameters: Record<string, number>
}
export interface AgentSkill {
  name: string
  description: string
  body: string
  enabled: boolean
  resources?: Record<string, string>
  resource_names?: string[]
  updated_at: number
}
export interface ConnectorConfig {
  id: string
  name: string
  type: 'http' | 'stdio' | 'sse'
  url: string
  command: string
  args: string[]
  env: Record<string, string>
  headers: Record<string, string>
  enabled: boolean
  timeout: number
}
export interface ConnectorTool {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}
export interface ConnectorStatus {
  state: 'disconnected' | 'checking' | 'connected' | 'error'
  tools: ConnectorTool[]
  error?: string
  checked_at?: number
}
export interface AttachmentSettings {
  enabled: boolean
  max_file_size_mb: number
  retrieval_limit: number
  retrieval_threshold: number
  chunk_size_chars: number
  overlap_chars: number
  parse_mode: 'auto' | 'inline' | 'embeddings' | 'retrieval'
  embedding_model: string
  search_mode: 'auto' | 'linear'
  auto_inline_context_ratio: number
  max_image_size_px: number
}
export interface WorkspaceFeatures {
  assistants: AssistantProfile[]
  default_assistant: string
  skills: AgentSkill[]
  connectors: ConnectorConfig[]
  connector_status: Record<string, ConnectorStatus>
  attachments: AttachmentSettings
}
export const DEFAULT_ATTACHMENTS: AttachmentSettings = {
  enabled: true,
  max_file_size_mb: 10,
  retrieval_limit: 6,
  retrieval_threshold: 0.1,
  chunk_size_chars: 2000,
  overlap_chars: 200,
  parse_mode: 'auto',
  embedding_model: '',
  search_mode: 'auto',
  auto_inline_context_ratio: 0.75,
  max_image_size_px: 2048,
}
export const DEFAULT_ASSISTANT: AssistantProfile = {
  id: 'atomic-chat',
  name: 'Atomic Chat',
  avatar: '*',
  description: '',
  instructions: 'You are Atomic Chat, a helpful AI assistant.\n\nCurrent date: {{current_date}}',
  parameters: { temperature: 0.7, top_p: 0.8, top_k: 20, repeat_penalty: 1.12 },
}
