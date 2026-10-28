import type { CoreLink } from '../core-link/index.js'
import type { AtcConfig, AtcPaths } from '../config/index.js'
import type { ErrorSink } from '../telemetry/index.js'
import type { WorkspaceAtc } from '../contract/index.js'
export interface WorkspaceServiceOptions {
  link: CoreLink
  paths: AtcPaths
  config: AtcConfig
  fetch?: typeof fetch
  platform?: NodeJS.Platform
  arch?: string
  selfCommand?: readonly string[]
  /** The server's environment: `HF_TOKEN` for gated model downloads. */
  env?: NodeJS.ProcessEnv
  /** atc's own error reports: failed model downloads go there. */
  errors?: ErrorSink
  /** Is a port free on every address that can shadow it? `api.start` refuses a busy one. */
  probePort?: (host: string, port: number) => Promise<'free' | 'busy'>
  /** What the server knows about atc releases (the daemon's `ReleaseWatch`); absent off a server. */
  atc?: () => WorkspaceAtc
}
