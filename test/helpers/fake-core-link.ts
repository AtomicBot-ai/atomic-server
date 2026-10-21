/** An in-memory `CoreLink`: records calls, answers from a scripted snapshot, emits what a test says. */
import type { CoreEventMessage, CoreSnapshot } from '@atomic-chat/core/client'
import type { HardwareInfoResponse } from '@atomic-chat/core/contracts'
import type { CoreEventHandler, CoreLink } from '../../src/core-link/index.js'

export interface FakeCoreLink extends CoreLink {
  calls: Array<{ method: string; path: string; body?: unknown }>
  snapshotValue: CoreSnapshot
  emit(message: CoreEventMessage): void
  shutdowns: number
  /**
   * What `request` answers for `"<METHOD> <path>"`, as the real core would; anything else gets `{}`.
   * A function answers each call from its body; an `Error` it returns or throws is thrown.
   */
  responses: Record<string, unknown>
}

/** A machine without a GPU, as the core's own probe describes it (`GET /hardware/info`). */
export const FAKE_HARDWARE: HardwareInfoResponse = {
  info: {
    cpu: { name: 'Fake CPU', core_count: 8, arch: 'aarch64', extensions: [], extensions_known: true },
    os_type: 'macos',
    os_name: 'macOS',
    total_memory: 16384,
    gpus: [],
  },
  source: 'probe',
  probed_at: 0,
  warnings: [],
}

export function fakeCoreLink(over: Partial<CoreSnapshot> = {}): FakeCoreLink {
  const handlers = new Set<CoreEventHandler>()
  const snapshot: CoreSnapshot = {
    instance_id: 'fake-instance',
    owner_scope: 'cli',
    protocol: 1,
    version: '0.4.0',
    pid: 4242,
    data_folder: '/tmp/fake',
    cursor: 'fake-instance:0',
    sessions: [],
    server: {
      running: false,
      host: '127.0.0.1',
      port: 1337,
      prefix: '/v1',
      requires_api_key: false,
      pid: null,
    },
    clients: [],
    downloads: [],
    ...over,
  }
  const link: FakeCoreLink = {
    calls: [],
    snapshotValue: snapshot,
    shutdowns: 0,
    responses: { 'GET /hardware/info': FAKE_HARDWARE },
    endpoint: {
      baseUrl: 'http://127.0.0.1:0',
      instanceId: snapshot.instance_id,
      version: snapshot.version,
      pid: snapshot.pid,
    },
    health: async () => ({
      ok: true,
      pid: snapshot.pid,
      version: snapshot.version,
      instance_id: snapshot.instance_id,
      protocol: snapshot.protocol,
    }),
    snapshot: async () => link.snapshotValue,
    request: async <T>(method: string, path: string, body?: unknown) => {
      link.calls.push({ method, path, body })
      const answer = link.responses[`${method} ${path}`]
      const value = typeof answer === 'function' ? await (answer as (b: unknown) => unknown)(body) : answer
      if (value instanceof Error) throw value
      return (value ?? {}) as T
    },
    models: {
      load: async (provider, modelId) => {
        link.calls.push({ method: 'POST', path: `/models/${provider}/${modelId}/load` })
        return {
          pid: 1,
          port: 8000,
          model_id: modelId,
          model_path: '',
          is_embedding: false,
          api_key: '',
        } as never
      },
      unload: async (provider, modelId) => {
        link.calls.push({ method: 'POST', path: `/models/${provider}/${modelId}/unload` })
        return { success: true } as never
      },
      cancelLoad: async () => false,
      sessions: async () => link.snapshotValue.sessions,
    },
    server: {
      status: async () => link.snapshotValue.server,
      start: async (body) => {
        link.calls.push({ method: 'POST', path: '/server/start', body })
        return { ...link.snapshotValue.server, running: true }
      },
      stop: async () => ({ ...link.snapshotValue.server, running: false }),
    },
    disk: { available: async () => 10 * 1024 ** 3 },
    // The same routes `HttpCoreLink` calls, recorded and answered like `request`.
    environments: {
      list: async () =>
        ((await link.request<{ environments?: unknown[] }>('GET', '/environments')).environments ??
          []) as never,
      probe: (input) => link.request('POST', '/environments/probe', input),
      begin: (id, input) => link.request('POST', `/environments/${id}/operations`, input),
      get: (op) => link.request('GET', `/environments/operations/${op}`),
      cancel: (op) => link.request('POST', `/environments/operations/${op}/cancel`),
      resume: (op, input) => link.request('POST', `/environments/operations/${op}/resume`, input),
      hostStepResult: async (op, receipt) => {
        link.calls.push({
          method: 'POST',
          path: `/environments/operations/${op}/host-step-result`,
          body: receipt,
        })
        return {}
      },
    },
    shutdown: async () => {
      link.shutdowns += 1
    },
    withLease: async (_name, work) => work(link, 'client-1'),
    events: {
      subscribe: async (handler, options) => {
        handlers.add(handler)
        options.onSnapshot?.(link.snapshotValue)
        await new Promise<void>((resolve) =>
          options.signal.addEventListener('abort', () => resolve(), { once: true })
        )
        handlers.delete(handler)
      },
    },
    emit: (message) => {
      for (const h of handlers) h(message)
    },
  }
  return link
}
