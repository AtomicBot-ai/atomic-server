/** The engines guided setup offers: what the core registers here, and llama.cpp's live build catalogs. */

import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type { EngineId, EngineVersionsResponse } from '@atomic-chat/core/contracts'
import type { CoreLink } from '../core-link/index.js'
import { orderEngines } from '../workspace-view/index.js'
import type { BackendCatalogResponse } from './types.js'
import { setupWait } from './wait.js'

/** Every engine the core registers on this host (`engines.list`), in display order. */
export async function registeredEngines(link: CoreLink): Promise<string[]> {
  const { engines } = await link.request<EngineVersionsResponse>('POST', '/engines/versions', {})
  return orderEngines((engines ?? []).map((e) => e.engine as string))
}

/** The build catalog of each llama.cpp engine the core registers; an engine without builds is left out. */
export async function engineCatalogs(link: CoreLink): Promise<BackendCatalogResponse[]> {
  const llama = (await registeredEngines(link)).filter((e) => ENGINE_KINDS[e as EngineId] === 'llamacpp')
  const outcomes = await Promise.allSettled(
    llama.map((p) =>
      setupWait(
        link.request<BackendCatalogResponse>('POST', `/backends/${p}/catalog`, {}),
        new AbortController().signal,
        15000
      )
    )
  )
  const catalogs = outcomes.flatMap((r) =>
    r.status === 'fulfilled' && r.value.available.length ? [r.value] : []
  )
  // Every request failing is a failed check (the server went away), not a machine without engines.
  const failure = outcomes.length && outcomes.every((r) => r.status === 'rejected') ? outcomes[0] : undefined
  if (failure?.status === 'rejected') throw failure.reason
  if (!catalogs.length)
    throw new Error('No compatible engine could be found. Check your connection and retry.')
  return catalogs
}

/** The registered engines installed here: an active build, or a managed engine's installation. */
export async function installedEngines(link: CoreLink): Promise<string[]> {
  const { engines } = await link.request<EngineVersionsResponse>('POST', '/engines/versions', {})
  return orderEngines((engines ?? []).filter((e) => e.active).map((e) => e.engine as string))
}
