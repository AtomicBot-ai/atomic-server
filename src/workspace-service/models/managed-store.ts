/**
 * The models of the managed engines' shared store, as `models.installed` lists them (spec "Модели
 * хранилища в списке и удаление"): every folder under the store's root that holds `model.yml` (a folder
 * without one is a download in progress), once, with each managed provider the core says lists it
 * (`GET /models/<engine>/<id>/capabilities`) and its size on disk.
 */

import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ManagedModelLocation } from '@atomic-chat/core/contracts'
import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type { EngineId } from '@atomic-chat/core/contracts'
import type { CoreLink } from '../../core-link/index.js'
import { managedEngines } from '../managed/managed-models.js'
import { modelIdPath, segment } from '../validation.js'

export interface StoreModel {
  id: string
  name: string
  /** The first provider that lists it, for clients that read one. */
  provider: string
  providers: string[]
  store: 'managed'
  size_bytes: number
}

/** Bytes of every file under `dir`, recursively; 0 for a folder that cannot be read. */
export async function bytesUnder(dir: string): Promise<number> {
  let total = 0
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) total += await bytesUnder(path)
    else if (entry.isFile()) total += (await stat(path).catch(() => null))?.size ?? 0
  }
  return total
}

/** Model ids (`/`-separated) under `root`: folders holding `model.yml`, at most three levels down. */
async function modelIds(root: string, prefix: string[] = []): Promise<string[]> {
  const entries = await readdir(join(root, ...prefix), { withFileTypes: true }).catch(() => [])
  // core-boundary: model.yml — the store model's record in the core's store, read to list and remove it (ADR 2026-10-20-download-managed-models-in-atc)
  if (prefix.length && entries.some((e) => e.isFile() && e.name === 'model.yml')) return [prefix.join('/')]
  if (prefix.length >= 3) return []
  const ids: string[] = []
  for (const e of entries) if (e.isDirectory()) ids.push(...(await modelIds(root, [...prefix, e.name])))
  return ids.sort()
}

/** `registered`: the engines `engines.list` names here, when the caller already read them. */
export async function storeModels(link: CoreLink, registered?: readonly string[]): Promise<StoreModel[]> {
  const engines = registered
    ? registered.filter((e) => ENGINE_KINDS[e as EngineId] === 'managed')
    : (await managedEngines(link).catch(() => [])).map((e) => e.engine)
  if (engines.length === 0) return []
  const location = await link
    .request<ManagedModelLocation>('GET', '/managed-models/location')
    .catch(() => null)
  if (!location?.root) return []
  const rows: StoreModel[] = []
  for (const id of await modelIds(location.root)) {
    const providers: string[] = []
    for (const engine of engines) {
      const listed = await link
        .request('GET', `/models/${segment(engine)}/${modelIdPath(id)}/capabilities`)
        .then(() => true)
        .catch(() => false)
      if (listed) providers.push(engine)
    }
    rows.push({
      id,
      name: id,
      provider: providers[0] ?? engines[0]!,
      providers,
      store: 'managed',
      size_bytes: await bytesUnder(join(location.root, ...id.split('/'))),
    })
  }
  return rows
}
