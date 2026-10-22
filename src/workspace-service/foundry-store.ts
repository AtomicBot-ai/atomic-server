/**
 * Downloaded Foundry Local variants (spec `foundry-local-server`, "Запуск и удаление моделей Foundry
 * Local"): every folder under `<data>/foundry-local/models/` that holds `model.yml`, with the variant's
 * device, accelerator and size; removal is the shared one (`store-variants.ts`).
 */

import { ModelRegistry } from '@atomic-chat/core/models'
import type { DataLayout } from '@atomic-chat/core/host'
import type { CoreLink } from '../core-link/index.js'
import { bytesUnder } from './managed-store.js'
import { removeStoreVariant } from './store-variants.js'

const PROVIDER = 'foundry-local'

export interface FoundryStoreModel {
  id: string
  name: string
  provider: typeof PROVIDER
  providers: [typeof PROVIDER]
  store: typeof PROVIDER
  /** The model the variant is of (`foundry_local.model_id`). */
  model: string
  device: string
  execution_provider: string
  size_bytes: number
}

interface FoundryBlock {
  model_id?: unknown
  device?: unknown
  execution_provider?: unknown
}

export async function foundryStoreModels(layout: DataLayout): Promise<FoundryStoreModel[]> {
  const rows: FoundryStoreModel[] = []
  for (const entry of await new ModelRegistry(layout, PROVIDER).list()) {
    const block = (entry.yml as { foundry_local?: FoundryBlock }).foundry_local ?? {}
    rows.push({
      id: entry.id,
      name: String(entry.yml.name ?? entry.id),
      provider: PROVIDER,
      providers: [PROVIDER],
      store: PROVIDER,
      model: String(block.model_id ?? entry.id),
      device: String(block.device ?? ''),
      execution_provider: String(block.execution_provider ?? ''),
      size_bytes: await bytesUnder(entry.dir),
    })
  }
  return rows
}

/** Unload `id` if it is loaded, then delete its folder; `undefined` when it is not a Foundry Local variant. */
export const removeFoundryModel = (link: CoreLink, layout: DataLayout, id: string) =>
  removeStoreVariant(link, layout, PROVIDER, id)

/** Whether a downloaded variant takes tools, by its `model.yml` (`foundry_local.tools`). */
export async function foundryTakesTools(layout: DataLayout, id: string): Promise<boolean> {
  const entry = await new ModelRegistry(layout, PROVIDER).find(id).catch(() => undefined)
  return (entry?.yml as { foundry_local?: { tools?: unknown } } | undefined)?.foundry_local?.tools === true
}
