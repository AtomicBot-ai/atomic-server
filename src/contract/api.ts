/**
 * The admin BFF's wire types, shared with the SPA. Browser-safe: types only, and only type
 * imports from the rest of `atc`. Core shapes come from `atomic-chat-core/contracts`.
 */

import type { LocalApiServerState, SessionInfo } from '@atomic-chat/core/contracts'
import type { AtcConfig, ConfigSource, FieldType } from '../config/index.js'

export interface AdminStatus {
  atc: { version: string; git_sha: string | null; build_date: string | null; admin_ui: string }
  core: { version: string; instance_id: string; pid: number; protocol: number; uptime_ms: number | null }
  daemon: { pid: number; started_at: number; data_folder: string }
  admin: { host: string; port: number; url: string }
  api: LocalApiServerState
  sessions: Array<SessionInfo & { provider: string }>
  pending_host_steps: Array<{
    step_id: string
    operation_id: string
    instructions: string
    updated_at: number
  }>
}

export interface AdminConfigField {
  path: string
  type: FieldType
  description: string
  default: unknown
  values?: readonly string[]
  source: ConfigSource
}

export interface AdminConfigView {
  values: AtcConfig
  fields: AdminConfigField[]
}

export interface SessionRequest {
  token: string
}

/** The managed-environment wizard's states, as the SPA renders them. */
export type SetupState =
  | 'not-installed'
  | 'consent'
  | 'elevating'
  | 'installing'
  | 'relogin-required'
  | 'reboot-required'
  | 'ready'
  | 'failed'

export interface AdminErrorBody {
  error: { code: string; message: string; details?: string; hint?: string }
}
