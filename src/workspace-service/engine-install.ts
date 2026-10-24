import { randomUUID } from 'node:crypto'
import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type { EngineKind, EngineVersions, EngineVersionsResponse } from '@atomic-chat/core/contracts'
import type { CoreLink } from '../core-link/index.js'
import type { ProxyConfig } from '../downloads/index.js'
import { AtcError } from '../errors/index.js'
import type { ManagedInstallResult } from '../contract/index.js'
import { managedEngineState } from './managed-engines.js'
import { object, segment } from './validation.js'

/** How the core installs an engine (`ENGINE_KINDS`); `undefined` for a name it does not know. */
export function engineKind(engine: string): EngineKind | undefined {
  return (ENGINE_KINDS as Readonly<Record<string, EngineKind>>)[engine]
}

async function engineVersions(link: CoreLink, engine: string): Promise<EngineVersions | undefined> {
  const { engines } = await link.request<EngineVersionsResponse>('POST', '/engines/versions', {})
  return engines.find((e) => e.engine === engine)
}

/** Install through the core's `/engines/:engine/update`; a fresh llama.cpp engine gets the core's `latest`. */
/** `proxy`: atc's `proxy.*` — an engine build is a download, fetched with the proxy the request names. */
export async function installEngine(
  link: CoreLink,
  engine: string,
  request: Record<string, unknown> = {},
  proxy?: ProxyConfig | null
) {
  const update = (body: Record<string, unknown>) =>
    link.request('POST', `/engines/${segment(engine)}/update`, body)
  const kind = engineKind(engine)
  if (kind === 'managed') return installManaged(link, engine, request)
  const body = { task_id: randomUUID(), ...(proxy ? { proxy } : {}), ...request }
  if (kind === 'engine-build' || (kind === 'llamacpp' && request['target'])) return update(body)
  if (kind !== 'llamacpp') throw new AtcError('ATC_USAGE', 'Choose an engine from engines.list.')
  const latest = (await engineVersions(link, engine))?.latest
  if (!latest) throw new AtcError('ATC_USAGE', 'No compatible engine build is available.')
  return update({ ...body, target: { version: latest.version, variant: latest.variant } })
}

/** Install the engine a load needs when it has nothing to run on; a load picks among builds on disk. */
export async function ensureArtifactEngine(
  link: CoreLink,
  engine: string,
  taskId: string,
  proxy?: ProxyConfig | null,
  install?: () => Promise<void>
) {
  const kind = engineKind(engine)
  if (kind === 'llamacpp') {
    const installed = await link.request<{ backends: unknown[] }>('GET', `/backends/${engine}`)
    if (installed.backends.length) return
  } else if (kind === 'engine-build') {
    const catalog = await link.request<Record<string, unknown>>(
      'POST',
      `/engine-builds/${engine}/catalog`,
      {}
    )
    if (Object.keys(object(catalog['active'])).length) return
  }
  if (install) await install()
  else await installEngine(link, engine, { task_id: taskId }, proxy)
}

/**
 * A managed engine is never installed or replaced without consent: not installed — its plan, for the
 * person to agree to (`engines.operate`); installed with a newer release — the new release's plan, and
 * the core's reinstall (whose first step removes the installed image, keeping the models) only when the
 * request names that release in `approved_update`; otherwise — ready, and nothing begins.
 */
/**
 * The new release's plan, as the person agrees to it. The core's probe of it still sees the installed
 * release ("installed-with-other-descriptor"); the reinstall removes that one first, so it blocks nothing
 * here. Every other blocker stays. The digest is the core's, unchanged.
 */
async function updatePlan(link: CoreLink, engine: string, target: string) {
  const state = await managedEngineState(link, engine, target)
  if (!state.plan?.blockers) return state
  const blockers = state.plan.blockers.filter(
    (b) => (b as { reason?: unknown }).reason !== 'installed-with-other-descriptor'
  )
  return { ...state, plan: { ...state.plan, blockers } }
}

async function installManaged(
  link: CoreLink,
  engine: string,
  request: Record<string, unknown>
): Promise<ManagedInstallResult> {
  const versions = await engineVersions(link, engine)
  if (!versions)
    throw new AtcError(
      'ATC_USAGE',
      `${engine} is not available on this platform: the core does not offer it here.`,
      {
        hint: 'see atc engines status',
      }
    )
  if (!versions.active) return { engine, status: 'plan', state: await managedEngineState(link, engine) }
  if (!versions.update?.needed) return { engine, status: 'ready', active: versions.active }
  const target = versions.update.target?.version ?? ''
  if (request['approved_update'] !== target)
    return {
      engine,
      status: 'update',
      from: versions.active.version,
      target,
      state: await updatePlan(link, engine, target),
    }
  const requestId = typeof request['request_id'] === 'string' ? request['request_id'] : randomUUID()
  const started = await link.request<{ operation_id: string }>('POST', `/engines/${segment(engine)}/update`, {
    request_id: requestId,
  })
  return { engine, status: 'updating', operation_id: started.operation_id, request_id: requestId }
}
