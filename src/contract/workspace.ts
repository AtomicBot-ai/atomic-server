/** Shared operation contract for the terminal, browser and unattended clients. */
export type WorkspaceInput = Record<string, unknown>
export interface WorkspaceField {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array'
  description?: string
  enum?: readonly string[]
  default?: unknown
  minimum?: number
  maximum?: number
  items?: WorkspaceField
  properties?: Record<string, WorkspaceField>
  required?: string[]
  additionalProperties?: boolean
}
export interface WorkspaceOperation {
  name: string
  title: string
  group: string
  description: string
  mutates: boolean
  effect: 'read' | 'configure' | 'download' | 'load' | 'interrupt' | 'generate' | 'secret'
  inputSchema: {
    type: 'object'
    properties: Record<string, WorkspaceField>
    required: string[]
    additionalProperties: false
  }
}
export interface WorkspaceServiceRow {
  id: string
  provider: string
  model: string
  kind: 'chat' | 'image-video' | 'embedding' | 'decision'
  state: string
  details: Record<string, unknown>
}
export interface WorkspaceRequest {
  id: string
  model: string
  endpoint: string
  status: number | null
  headers_ms?: number | null
  duration_ms: number | null
  ttft_ms: number | null
  completion_tokens: number | null
  tokens_estimated: boolean
  finished_at: number
}
export interface WorkspaceSnapshot {
  version: 1
  captured_at: number
  core: { version: string; instance_id: string; uptime_ms: number | null }
  api: {
    running: boolean
    endpoint: string
    host: string
    port: number
    prefix: string
    raw: Record<string, unknown>
  }
  eye: 'offline' | 'starting' | 'ready' | 'busy' | 'overloaded' | 'error'
  services: WorkspaceServiceRow[]
  downloads: unknown[]
  setups: unknown[]
  setup: { mode: 'guided' | 'manual'; complete: boolean; updated_at: number } | null
  keys: Array<{ id: string; name: string; preview: string; createdAt: number }>
  metrics: {
    detailed?: boolean
    header_latency_ms?: number | null
    window_ms: number
    requests: number
    errors: number
    active: number | null
    mean_latency_ms: number | null
    mean_ttft_ms: number | null
    tokens_per_second: number | null
    since: number
  }
  requests: WorkspaceRequest[]
  errors: Array<{ source: string; message: string }>
}
