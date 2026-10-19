/** Paths the SPA calls, in one place on both sides. */
export const ADMIN_API = {
  status: '/api/status',
  workspace: '/api/workspace',
  workspaceExecute: '/api/workspace/execute',
  session: '/api/session',
  config: '/api/config',
  events: '/api/events',
  /** Prefix of the control-API proxy: `/api/core/snapshot` → core `/atomic/v1/snapshot`. */
  core: '/api/core',
  setup: '/api/setup',
  logs: '/api/logs',
} as const

export const ADMIN_HEADER = 'x-atc-admin'
export const SESSION_COOKIE = 'atc_session'
