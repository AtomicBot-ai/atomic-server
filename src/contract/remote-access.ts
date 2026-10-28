import type { RemoteAccessStatus } from '@atomic-chat/core/contracts'

/** `remote.status`, `remote.start` and `remote.stop` as the server answers them: the core's status, and more. */
export interface WorkspaceRemoteAccess extends RemoteAccessStatus {
  /** While the core reports `cloudflared_unavailable`: how to fix that on the server's machine. */
  cloudflared?: RemoteAccessSetup
}

/** Cloudflare's tunnel program on the server's machine, and how to install it there. */
export interface RemoteAccessSetup {
  /** The `cloudflared` the server found at start (it could not run), or null when it found none. */
  found: string | null
  /** Commands that install it on this system, in order; empty when only `url` says how. */
  commands: string[]
  /** Cloudflare's instructions for this system. */
  url: string
  /** What makes the server pick a new `cloudflared` up: it looks for one only when it starts. */
  restart: string
}
