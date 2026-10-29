import type { WorkspaceFeatures } from './workspace-features.js'
/** Shared operation contract for the terminal, browser and unattended clients. */
import type {
  EnvironmentOperation,
  LocalProviderId,
  RuntimeInstallation,
  SessionLoadStage,
} from '@atomic-chat/core/contracts'
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
  /** `execute`: defines or runs a program on the server's host (an MCP connector); agents need `--allow-exec`. */
  effect: 'read' | 'configure' | 'download' | 'load' | 'interrupt' | 'generate' | 'secret' | 'execute'
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
  features?: WorkspaceFeatures
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
  /** Managed engines with an installation or an unfinished operation, by engine id. */
  engines: WorkspaceEngine[]
  /** Privileged steps the server could not run itself, with the command to run as administrator. */
  host_steps: WorkspaceHostStep[]
  /** The last stage of each load in progress (`session:load-progress`); gone at `ready` or on failure. */
  loads: WorkspaceLoad[]
  /** The server's own atc and the newer release it has seen; absent when no server answers. */
  atc?: WorkspaceAtc
  /** Playground requests still running (`chat.start`): a client follows one in the chat it shows. */
  chats?: WorkspaceChat[]
  /** The model-ready email (`setup.reminder`) both clients show; never the address. */
  reminder?: WorkspaceReminder | null
}
/** An email reminder for a downloading model. The server keeps no address, only what it waits for. */
export interface WorkspaceReminder {
  setup_id: string
  model: string
  model_name: string
  /** `waiting` until the download is done and the service took the notification (`queued`). */
  status: 'waiting' | 'queued' | 'expired' | 'failed'
  registered_at: number
}
export interface WorkspaceChat {
  /** The job id, for `chat.progress`. */
  id: string
  conversation_id: string
  state: 'preparing' | 'generating' | 'stopping'
}
/** What the server knows about atc releases (`update.checkOnStart`: once on start, then daily). */
export interface WorkspaceAtc {
  version: string
  /** When the last look at releases succeeded, ms since the epoch; null before the first. */
  checked_at: number | null
  /** The newer release, or null while the installed atc is the latest it knows. */
  update: WorkspaceUpdate | null
}
export interface WorkspaceUpdate {
  version: string
  /** The release page. */
  url: string
  /** What installs it: `atc update`, the package manager's command, or null for a source tree. */
  command: string | null
}
export interface WorkspaceEngine {
  engine: string
  installation: RuntimeInstallation | null
  /** Its setup, update or removal in progress: phase, progress, `plan_digest`, `error`. */
  operation: EnvironmentOperation | null
}
export interface WorkspaceHostStep {
  step_id: string
  operation_id: string
  instructions: string
  updated_at: number
}
export interface WorkspaceLoad {
  provider: LocalProviderId
  model_id: string
  generation: string
  stage: SessionLoadStage
  elapsed_ms: number
  /** When the stage was seen, ms since the epoch. */
  at: number
}
