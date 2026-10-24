/**
 * The model formats the Local models catalog filters by, in the order both UIs offer them: GGUF always,
 * then MLX, the managed engines' safetensors, Foundry Local's and LiteRT-LM's own catalogs, each only
 * where an engine here runs it (the core's `engines.list`).
 */

import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type { EngineId } from '@atomic-chat/core/contracts'

export type CatalogFormat = 'gguf' | 'mlx' | 'safetensors' | 'foundry' | 'litert'

export const CATALOG_FORMAT_LABELS: Record<CatalogFormat, string> = {
  gguf: 'GGUF',
  mlx: 'MLX',
  safetensors: 'Safetensors',
  foundry: 'Foundry Local',
  litert: 'LiteRT-LM',
}

/** The engine whose own catalog (`models.search --engine`) a variant format reads. */
export const FORMAT_ENGINE: Partial<Record<CatalogFormat, string>> = {
  foundry: 'foundry-local',
  litert: 'litert-lm',
}

/** The format an engine runs: its own catalog's, MLX, safetensors for a managed engine, else GGUF. */
export function engineCatalogFormat(engine: string): CatalogFormat {
  if (engine === 'mlx') return 'mlx'
  const own = (Object.keys(FORMAT_ENGINE) as CatalogFormat[]).find((f) => FORMAT_ENGINE[f] === engine)
  return own ?? (ENGINE_KINDS[engine as EngineId] === 'managed' ? 'safetensors' : 'gguf')
}

export function catalogFormatsFor(engines: readonly string[]): CatalogFormat[] {
  const present = new Set(engines.map(engineCatalogFormat))
  return (Object.keys(CATALOG_FORMAT_LABELS) as CatalogFormat[]).filter((f) => f === 'gguf' || present.has(f))
}
