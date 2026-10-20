/**
 * Which providers list an installed model (spec server-engine-settings, "Провайдер установленной модели
 * MUST браться из данных core о модели"): the providers this host registers that read the model's folder
 * by the core's data layout (llama.cpp's three share one), each kept only when its capabilities route
 * answers for the model. The one source both UIs and `atc models list` read.
 */

import type { DataLayout } from '@atomic-chat/core/host'
import type { EngineVersionsResponse } from '@atomic-chat/core/contracts'
import type { CoreLink } from '../core-link/index.js'
import { modelIdPath, segment } from './validation.js'

interface Row {
  id: string
  provider: string
  providers?: string[]
  store?: string
}

const folderOf = (layout: DataLayout, provider: string) => {
  try {
    return layout.provider(provider as never).modelsDir
  } catch {
    return undefined
  }
}

/** `rows` with `providers` filled (the managed store's rows already carry theirs) and `provider` its first. */
export async function withProviders<T extends Row>(
  link: CoreLink,
  layout: DataLayout,
  rows: T[]
): Promise<Array<T & { providers: string[] }>> {
  const registered = await link
    .request<EngineVersionsResponse>('POST', '/engines/versions', {})
    .then((r) => (r.engines ?? []).map((e) => e.engine))
    .catch(() => null)
  const lists = (provider: string, id: string) =>
    link
      .request('GET', `/models/${segment(provider)}/${modelIdPath(id)}/capabilities`)
      .then(() => true)
      .catch(() => false)
  return Promise.all(
    rows.map(async (row) => {
      if (row.store === 'managed') return { ...row, providers: row.providers ?? [row.provider] }
      const folder = folderOf(layout, row.provider)
      const candidates = registered
        ? registered.filter((p) => folder !== undefined && folderOf(layout, p) === folder)
        : [row.provider]
      const answers = await Promise.all(candidates.map((p) => lists(p, row.id)))
      const providers = candidates.filter((_p, i) => answers[i])
      return { ...row, provider: providers[0] ?? row.provider, providers }
    })
  )
}
