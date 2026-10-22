/**
 * Downloaded LiteRT-LM variants (spec `litert-lm-server`, "Модели LiteRT-LM в atc"): every folder under
 * `<data>/litert-lm/models/` that holds `model.yml` — a folder without one is an unfinished download —
 * with the variant's model, backend, NPU and size; removal is the shared one (`store-variants.ts`).
 */

import { ModelRegistry } from '@atomic-chat/core/models'
import type { DataLayout } from '@atomic-chat/core/host'
import type { CoreLink } from '../core-link/index.js'
import { bytesUnder } from './managed-store.js'
import { removeStoreVariant } from './store-variants.js'

const PROVIDER = 'litert-lm'

export interface LiteRtStoreModel {
  id: string
  name: string
  provider: typeof PROVIDER
  providers: [typeof PROVIDER]
  store: typeof PROVIDER
  /** The model the variant is of (`litert_lm.model_id`). */
  model: string
  backend: string
  npu?: string
  size_bytes: number
}

export async function liteRtStoreModels(layout: DataLayout): Promise<LiteRtStoreModel[]> {
  const rows: LiteRtStoreModel[] = []
  for (const entry of await new ModelRegistry(layout, PROVIDER).list()) {
    const block =
      (entry.yml as { litert_lm?: { model_id?: unknown; backend?: unknown; npu?: unknown } }).litert_lm ?? {}
    rows.push({
      id: entry.id,
      name: String(entry.yml.name ?? entry.id),
      provider: PROVIDER,
      providers: [PROVIDER],
      store: PROVIDER,
      model: String(block.model_id ?? entry.id),
      backend: String(block.backend ?? ''),
      ...(typeof block.npu === 'string' ? { npu: block.npu } : {}),
      size_bytes: await bytesUnder(entry.dir),
    })
  }
  return rows
}

/** Unload `id` if it is loaded, then delete its folder; `undefined` when it is not a LiteRT-LM variant. */
export const removeLiteRtModel = (link: CoreLink, layout: DataLayout, id: string) =>
  removeStoreVariant(link, layout, PROVIDER, id)
