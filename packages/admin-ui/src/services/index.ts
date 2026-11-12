/**
 * Service Hub - Centralized service initialization and access
 *
 * The app's hub picks Tauri or web implementations per platform; the admin has one platform, the
 * daemon's BFF under `/api`. The name and the `useServiceHub()` shape stay, so pages lift 1:1.
 */

import type { AdminStatus } from '@contract'
import { ADMIN_BASE, createAdminApi } from './admin-api'
import type { AdminApi } from './admin-api'
import { createCoreBridge } from './core-bridge'
import type { CoreBridge } from './core-bridge'
import { createEventSource } from './events'
import type { AdminEventSource, EventSourceFactory } from './events'
import { createSessionService } from './session'
import type { SessionService } from './session'

export interface StatusService {
  fetch(): Promise<AdminStatus>
}

export interface ServiceHub {
  // Service getters - all synchronous after initialization
  core(): CoreBridge
  events(): AdminEventSource
  status(): StatusService
  session(): SessionService
}

export interface ServiceHubOptions {
  /** Where the BFF is mounted; `/api` on the daemon. */
  base?: string
  /** A stand-in for the browser's `EventSource` (tests). */
  eventSource?: EventSourceFactory
}

class AdminServiceHub implements ServiceHub {
  private readonly api: AdminApi
  private readonly coreBridge: CoreBridge
  private readonly eventSource: AdminEventSource
  private readonly statusService: StatusService
  private readonly sessionService: SessionService

  constructor(options: ServiceHubOptions = {}) {
    const base = options.base ?? ADMIN_BASE
    this.api = createAdminApi(base)
    this.coreBridge = createCoreBridge(base)
    this.eventSource = createEventSource(base, options.eventSource)
    this.statusService = { fetch: () => this.api.status() }
    // Signing out drops the stream too; the next page load opens a fresh one with its new cookie.
    this.sessionService = createSessionService(this.api, () => this.eventSource.close())
  }

  core(): CoreBridge {
    return this.coreBridge
  }

  events(): AdminEventSource {
    return this.eventSource
  }

  status(): StatusService {
    return this.statusService
  }

  session(): SessionService {
    return this.sessionService
  }
}

export function createServiceHub(options?: ServiceHubOptions): ServiceHub {
  return new AdminServiceHub(options)
}
