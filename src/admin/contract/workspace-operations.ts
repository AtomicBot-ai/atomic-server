import { SERVER_OPERATIONS } from './operations/server.js'
import { MODEL_OPERATIONS } from './operations/models.js'
import { ENGINE_OPERATIONS } from './operations/engines.js'
import { PLAYGROUND_OPERATIONS } from './operations/playground.js'
import { MEDIA_OPERATIONS } from './operations/media.js'
/** One registry for the TUI, web admin, CLI and MCP. Files follow the workspace sections. */
export const WORKSPACE_OPERATIONS = [
  ...SERVER_OPERATIONS,
  ...MODEL_OPERATIONS,
  ...ENGINE_OPERATIONS,
  ...PLAYGROUND_OPERATIONS,
  ...MEDIA_OPERATIONS,
] as const
