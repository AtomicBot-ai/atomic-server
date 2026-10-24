import { cloudChatServices } from './chat-readiness.js'
import type { CoreLink } from '../core-link/index.js'
import type { AtcConfig, AtcPaths } from '../config/index.js'
import type { WorkspaceEngine, WorkspaceSnapshot, WorkspaceServiceRow } from '../contract/index.js'
import { MANAGED_FINISHED_PHASES } from '../contract/index.js'
import type { CoreSnapshot } from '@atomic-chat/core/client'
import { HostStepJournal, waitingHostSteps } from '../host/index.js'
import type { ClientKeys } from '../terminal-data/index.js'
import { object, sanitized } from './validation.js'
import { readWorkspaceSetup } from './state.js'
import type { WorkspaceMetrics } from './metrics.js'
export function publicEndpoint(server: Record<string, unknown>, config: AtcConfig) {
  if (server['running'] !== true)
    server = { host: config.api.host, port: config.api.port, prefix: config.api.prefix }
  const host = String(server['host'] ?? config.api.host),
    port = Number(server['port'] ?? config.api.port),
    prefix = String(server['prefix'] ?? config.api.prefix)
  const connectHost = ['0.0.0.0', '::', '[::]'].includes(host) ? '127.0.0.1' : host
  return {
    host,
    port,
    prefix,
    endpoint: `http://${connectHost.includes(':') ? `[${connectHost}]` : connectHost}:${port}${prefix}`,
  }
}
/**
 * Managed engines with an installation or an operation still running, in the core's snapshot, and the
 * privileged steps those operations wait on (the daemon's journal, as `atc status` reads it).
 */
async function managedState(snap: CoreSnapshot, journalPath: string) {
  const operations = (snap.environment_operations ?? []).filter(
    (o) => !(MANAGED_FINISHED_PHASES as readonly string[]).includes(o.phase)
  )
  const engines = new Map<string, WorkspaceEngine>()
  const entry = (engine: string) =>
    engines.get(engine) ?? engines.set(engine, { engine, installation: null, operation: null }).get(engine)!
  for (const i of snap.environments?.[0]?.installations ?? []) entry(i.engine_id).installation = i
  for (const o of operations) if (o.target.kind === 'runtime') entry(o.target.engine_id).operation = o
  const journal = await new HostStepJournal(journalPath).load()
  return {
    engines: [...engines.values()].sort((a, b) => a.engine.localeCompare(b.engine)),
    host_steps: waitingHostSteps(journal, operations).map((e) => ({
      step_id: e.step_id,
      operation_id: e.operation_id,
      instructions: e.instructions ?? '',
      updated_at: e.updated_at,
    })),
  }
}
export async function workspaceSnapshot(
  link: CoreLink,
  paths: AtcPaths,
  config: AtcConfig,
  keys: ClientKeys,
  metrics: WorkspaceMetrics
): Promise<WorkspaceSnapshot> {
  const [snap, health] = await Promise.all([
    link.snapshot(),
    link.request<{ uptime_ms?: number }>('GET', '/health'),
  ])
  const errors: WorkspaceSnapshot['errors'] = []
  const results = await Promise.allSettled(
    ['diffusion', 'embedding', 'decision'].map(async (kind) => {
      const status = await link.request('GET', `/${kind}/status`)
      if (kind !== 'decision') return status
      // Core's decision status omits the public model ID; the module's config owns it.
      const answer = object(await link.request('GET', '/decision/config'))
      return { ...object(status), model_id: object(answer['config'])['model_id'] }
    })
  )
  const services: WorkspaceServiceRow[] = snap.sessions.map((session) => {
    const safe = object(sanitized(session))
    return {
      id: String(safe['id'] ?? `${safe['provider']}:${safe['model_id']}`),
      provider: String(safe['provider'] ?? ''),
      model: String(safe['model_id'] ?? ''),
      kind: safe['is_embedding'] === true ? 'embedding' : 'chat',
      state: String(safe['state'] ?? 'ready'),
      details: safe,
    }
  })
  try {
    services.push(...(await cloudChatServices(link)))
  } catch (error) {
    errors.push({ source: 'cloud', message: error instanceof Error ? error.message : String(error) })
  }
  results.forEach((result, i) => {
    const kind = (['image-video', 'embedding', 'decision'] as const)[i]!
    if (result.status === 'rejected') {
      errors.push({
        source: kind,
        message: String(result.reason instanceof Error ? result.reason.message : result.reason),
      })
      return
    }
    const details = object(sanitized(result.value)),
      model = object(details['model']),
      loaded = object(model['loaded'] ?? details['loadedModel'])
    const state = String(
      model['state'] ??
        details['state'] ??
        details['status'] ??
        (Object.keys(loaded).length ? 'ready' : 'offline')
    )
    if (state === 'unloaded' || state === 'stopped' || state === 'offline' || state === 'disabled') return
    services.push({
      id: kind,
      provider:
        kind === 'image-video'
          ? 'sd-cpp'
          : String(object(details['engine'])['provider'] ?? details['provider'] ?? ''),
      model: String(details['model_id'] ?? details['modelId'] ?? loaded['modelId'] ?? loaded['id'] ?? ''),
      kind,
      state,
      details,
    })
  })
  const server = object(sanitized(snap.server)),
    running = server['running'] === true
  const statistics = metrics.snapshot()
  return {
    version: 1,
    captured_at: Date.now(),
    core: { version: snap.version, instance_id: snap.instance_id, uptime_ms: health.uptime_ms ?? null },
    api: { running, ...publicEndpoint(server, config), raw: server },
    eye: services.some((s) => ['failed', 'unsupported'].includes(s.state))
      ? 'error'
      : services.some((s) => ['loading', 'starting', 'restarting'].includes(s.state))
        ? 'starting'
        : !running
          ? 'offline'
          : statistics.requests.some((r) => r.status === 429 && Date.now() - r.finished_at < 30000)
            ? 'overloaded'
            : (statistics.metrics.active ?? 0) > 0 ||
                services.some((s) => s.details['activeJob'] || s.details['activeVideoJob'])
              ? 'busy'
              : 'ready',
    services,
    downloads: sanitized(snap.downloads) as unknown[],
    setups: [],
    setup: await readWorkspaceSetup(paths),
    keys: await keys.list(),
    ...statistics,
    errors,
    ...(await managedState(snap, paths.hostStepsJournal)),
    loads: [],
  }
}
