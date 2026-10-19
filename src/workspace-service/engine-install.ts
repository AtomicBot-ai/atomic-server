import { randomUUID } from 'node:crypto'
import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type { EngineKind, EngineVersions, EngineVersionsResponse } from '@atomic-chat/core/contracts'
import type { CoreLink } from '../core-link/index.js'
import { AtcError } from '../errors/index.js'
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
  if (kind === 'managed') {
    if (!(await engineVersions(link, engine))?.active)
      throw new AtcError(
        'ATC_USAGE',
        'Prepare this managed engine through environments.probe, then environments.begin using the reviewed plan.',
        { hint: 'Managed host steps require the plan digest and explicit approval.' }
      )
    return update({ request_id: randomUUID(), ...request })
  }
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
