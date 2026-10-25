/**
 * Variants a client downloads into a provider's own models folder (Foundry Local, LiteRT-LM): removal
 * unloads a loaded variant, then deletes its folder inside that root — never through the managed
 * store's route; and what a variant takes in a chat, by its `model.yml`.
 */

import { ModelRegistry } from '@atomic-chat/core/models'
import type { DataLayout } from '@atomic-chat/core/host'
import type { CoreLink } from '../../core-link/index.js'
import { bytesUnder } from './managed-store.js'

/** Unload `id` if it is loaded, then delete its folder; `undefined` when `provider` has no such variant. */
export async function removeStoreVariant(
  link: CoreLink,
  layout: DataLayout,
  provider: 'foundry-local' | 'litert-lm',
  id: string
) {
  const registry = new ModelRegistry(layout, provider)
  const entry = await registry.find(id)
  if (!entry) return undefined
  const loaded = (await link.models.sessions()).some((s) => s.provider === provider && s.model_id === id)
  if (loaded) await link.models.unload(provider, id)
  const freed = await bytesUnder(entry.dir)
  await registry.remove(id)
  return { removed: true, model_id: id, was_loaded: loaded, freed_bytes: freed }
}

/** Tools and images for `chatRequestFor`: Foundry Local's `tools`, LiteRT-LM's `tools` and `vision`. */
export async function chatAbilities(
  layout: DataLayout,
  provider: string,
  model: string
): Promise<{ tools?: boolean; vision?: boolean }> {
  if (provider !== 'foundry-local' && provider !== 'litert-lm') return {}
  const entry = await new ModelRegistry(layout, provider).find(model).catch(() => undefined)
  const yml = (entry?.yml ?? {}) as Record<string, { tools?: unknown; vision?: unknown } | undefined>
  if (provider === 'foundry-local') return { tools: yml['foundry_local']?.tools === true }
  return { tools: yml['litert_lm']?.tools === true, vision: yml['litert_lm']?.vision === true }
}
