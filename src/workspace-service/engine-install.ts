import { randomUUID } from 'node:crypto'
import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type { EngineKind, EngineVersions, EngineVersionsResponse } from '@atomic-chat/core/contracts'
import type { CoreLink } from '../core-link/index.js'
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
export async function installEngine(link: CoreLink, engine: string, request: Record<string, unknown> = {}) {
  const update = (body: Record<string, unknown>) =>
    link.request('POST', `/engines/${segment(engine)}/update`, body)
  const kind = engineKind(engine)
  if (kind === 'managed') return installManaged(link, engine, request)
  const body = { task_id: randomUUID(), ...request }
  if (kind === 'engine-build' || (kind === 'llamacpp' && request['target'])) return update(body)
  if (kind !== 'llamacpp') throw new AtcError('ATC_USAGE', 'Choose an engine from engines.list.')
  const latest = (await engineVersions(link, engine))?.latest
  if (!latest) throw new AtcError('ATC_USAGE', 'No compatible engine build is available.')
  return update({ ...body, target: { version: latest.version, variant: latest.variant } })
}

/** Install the engine a load needs when it has nothing to run on; a load picks among builds on disk. */
export async function ensureArtifactEngine(link: CoreLink, engine: string, taskId: string) {
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
  await installEngine(link, engine, { task_id: taskId })
}

/**
 * A managed engine is never installed without consent: not installed — its plan, for the person to
 * agree to (`engines.operate`); installed with a newer release — the core's reinstall, whose setup
 * then waits for consent like any setup; otherwise — ready, and nothing begins.
 */
async function installManaged(
  link: CoreLink,
  engine: string,
  request: Record<string, unknown>
): Promise<ManagedInstallResult> {
  const versions = await engineVersions(link, engine)
  if (!versions?.active) return { engine, status: 'plan', state: await managedEngineState(link, engine) }
  if (!versions.update?.needed) return { engine, status: 'ready', active: versions.active }
  const requestId = typeof request['request_id'] === 'string' ? request['request_id'] : randomUUID()
  const started = await link.request<{ operation_id: string }>('POST', `/engines/${segment(engine)}/update`, {
    request_id: requestId,
  })
  return { engine, status: 'updating', operation_id: started.operation_id, request_id: requestId }
}
