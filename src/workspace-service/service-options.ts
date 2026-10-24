import type { CoreLink } from '../core-link/index.js'
import type { AtcConfig, AtcPaths } from '../config/index.js'
import type { ErrorSink } from '../telemetry/index.js'
export interface WorkspaceServiceOptions {
  link: CoreLink
  paths: AtcPaths
  config: AtcConfig
  fetch?: typeof fetch
  platform?: NodeJS.Platform
  selfCommand?: readonly string[]
  /** The server's environment: `HF_TOKEN` for gated model downloads. */
  env?: NodeJS.ProcessEnv
  /** atc's own error reports: failed model downloads go there. */
  errors?: ErrorSink
}
