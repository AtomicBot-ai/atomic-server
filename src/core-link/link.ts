/**
 * The typed view of a running core that commands, the daemon and the admin BFF share. Nothing
 * outside `core-link/` builds a URL or reads a token. One implementation, `HttpCoreLink`, over the
 * core's `CoreClient`; a fake in `test/helpers/` for everything above it.
 */

import type { HardwareOverrideInput, LocalApiServerState, SessionInfo, UnloadResult } from '@atomic-chat/core'
import { AtomicCoreError } from '@atomic-chat/core'
import type { CoreClient, CoreEventMessage, CoreSnapshot } from '@atomic-chat/core/client'
import { AtcError } from '../errors/index.js'
import type { ManagedHostReceipt } from '../host/index.js'

export interface CoreEndpoint {
  baseUrl: string
  instanceId: string
  version: string
  pid: number
}

export interface StartServerBody {
  host?: string
  port?: number
  prefix?: string
  api_key?: string
  trusted_hosts?: string[]
  proxy_timeout_secs?: number
  state_file?: boolean
  fallback_port?: boolean
}

export type CoreEventHandler = (message: CoreEventMessage) => void

export interface CoreEventSource {
  /** Snapshot first, then the stream from its cursor; on `resync`, snapshot again. Ends on abort. */
  subscribe(
    handler: CoreEventHandler,
    options: { signal: AbortSignal; onSnapshot?: (snapshot: CoreSnapshot) => void }
  ): Promise<void>
}

export type SessionSummary = SessionInfo & { provider: string }

export interface CoreLink {
  readonly endpoint: CoreEndpoint
  health(): Promise<{ ok: true; pid: number; version: string; instance_id: string; protocol: number }>
  snapshot(): Promise<CoreSnapshot>
  /** A typed call to any control route; the admin BFF allowlists what reaches it. */
  request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T>
  models: {
    load(provider: string, modelId: string, options?: Record<string, unknown>): Promise<SessionInfo>
    unload(provider: string, modelId: string): Promise<UnloadResult>
    cancelLoad(provider: string, modelId: string): Promise<boolean>
    sessions(): Promise<SessionSummary[]>
  }
  server: {
    status(): Promise<LocalApiServerState>
    start(body: StartServerBody): Promise<LocalApiServerState>
    stop(): Promise<LocalApiServerState>
  }
  hardware: {
    set(input: HardwareOverrideInput): Promise<void>
    clear(): Promise<boolean>
  }
  disk: { available(path?: string): Promise<number | null> }
  environments: {
    list(): Promise<unknown[]>
    probe(input: unknown): Promise<unknown>
    begin(environmentId: string, input: unknown): Promise<unknown>
    get(operationId: string): Promise<unknown>
    cancel(operationId: string): Promise<unknown>
    resume(operationId: string, input: unknown): Promise<unknown>
    hostStepResult(operationId: string, receipt: ManagedHostReceipt): Promise<unknown>
  }
  shutdown(options?: { force?: boolean; client_id?: string }): Promise<void>
  /** A renewable registration held only while `work` runs; how `stop` knows who is attached. */
  withLease<T>(name: string, work: (link: CoreLink, clientId: string) => Promise<T>): Promise<T>
  events: CoreEventSource
}

export interface HttpCoreLinkOptions {
  endpoint: CoreEndpoint
  client: CoreClient
  events: CoreEventSource
  pid: number
  log?: (message: string) => void
}

/** Managed environments are missing from the embedded core until the branch lands: say so. */
function unavailable(error: unknown): never {
  if (
    error instanceof AtomicCoreError &&
    error.code === 'INVALID_ARGUMENT' &&
    /No such control route/.test(error.message)
  ) {
    throw new AtcError('ATC_NOT_IMPLEMENTED', 'Managed environments are not available in this core build.', {
      details: 'the embedded core has no /environments routes yet (core branch feat/tenzor-rt)',
    })
  }
  throw error
}

export class HttpCoreLink implements CoreLink {
  readonly endpoint: CoreEndpoint
  readonly events: CoreEventSource
  readonly models: CoreLink['models']
  readonly server: CoreLink['server']
  readonly hardware: CoreLink['hardware']
  readonly disk: CoreLink['disk']
  readonly environments: CoreLink['environments']
  private readonly client: CoreClient
  private readonly pid: number
  private readonly log: (message: string) => void

  constructor(options: HttpCoreLinkOptions) {
    this.endpoint = options.endpoint
    this.client = options.client
    this.events = options.events
    this.pid = options.pid
    this.log = options.log ?? (() => undefined)
    const c = this.client
    this.models = {
      load: (provider, modelId, body = {}) => c.loadModel(provider, modelId, body),
      unload: (provider, modelId) => c.unloadModel(provider, modelId),
      cancelLoad: (provider, modelId) => c.cancelModelLoad(provider, modelId),
      sessions: async () => (await c.sessions()).sessions,
    }
    this.server = {
      status: () => c.serverStatus(),
      start: (body) => c.startServer(body),
      stop: () => c.stopServer(),
    }
    this.hardware = {
      set: async (input) => {
        await c.request('PUT', '/hardware/override', input)
      },
      clear: async () => {
        const result = await c.request<{ cleared?: boolean }>('DELETE', '/hardware/override')
        return result.cleared !== false
      },
    }
    this.disk = { available: (path) => c.availableDiskSpace(path) }
    const env = <T>(p: Promise<T>) => p.catch(unavailable)
    this.environments = {
      list: () =>
        env(c.request<{ environments: unknown[] }>('GET', '/environments').then((r) => r.environments)),
      probe: (input) => env(c.request('POST', '/environments/probe', input)),
      begin: (id, input) =>
        env(c.request('POST', `/environments/${encodeURIComponent(id)}/operations`, input)),
      get: (op) => env(c.request('GET', `/environments/operations/${encodeURIComponent(op)}`)),
      cancel: (op) => env(c.request('POST', `/environments/operations/${encodeURIComponent(op)}/cancel`)),
      resume: (op, input) =>
        env(c.request('POST', `/environments/operations/${encodeURIComponent(op)}/resume`, input)),
      hostStepResult: (op, receipt) =>
        env(
          c.request('POST', `/environments/operations/${encodeURIComponent(op)}/host-step-result`, receipt)
        ),
    }
  }

  health(): ReturnType<CoreLink['health']> {
    return this.client.health()
  }

  snapshot(): Promise<CoreSnapshot> {
    return this.client.snapshot()
  }

  request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
    return this.client.request<T>(method, path, body)
  }

  async shutdown(options: { force?: boolean; client_id?: string } = {}): Promise<void> {
    await this.client.shutdown(options)
  }

  async withLease<T>(_name: string, work: (link: CoreLink, clientId: string) => Promise<T>): Promise<T> {
    const registration = await this.client.register(this.pid)
    const clientId = registration.client.id
    let inflight: Promise<unknown> | undefined
    const timer = setInterval(() => {
      if (inflight) return
      inflight = this.client
        .heartbeat(clientId)
        .catch((error: unknown) => this.log(`heartbeat failed: ${String(error)}`))
        .finally(() => {
          inflight = undefined
        })
    }, registration.heartbeat_interval_ms)
    timer.unref?.()
    try {
      return await work(this, clientId)
    } finally {
      clearInterval(timer)
      await inflight
      try {
        await this.client.unregister(clientId)
      } catch {
        // A shutdown command or a crashed daemon cannot acknowledge; the registration has a TTL.
      }
    }
  }
}
