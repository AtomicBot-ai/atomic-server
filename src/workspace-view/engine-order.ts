/**
 * Engines in the order and by the names both UIs show them (spec server-engine-settings): llama.cpp's
 * family first, MLX, then the managed engines in the desktop app's order (vLLM, SGLang, TensorRT-LLM),
 * then Foundry Local; an engine this list does not know goes last, as given. Which engines exist is the
 * core's answer (`engines.list`), never this list.
 */

import { ENGINE_KINDS } from '@atomic-chat/core/contracts'

const ORDER = [
  'llamacpp-upstream',
  'llamacpp',
  'atomic-prism',
  'mlx',
  'vllm',
  'sglang',
  'tensorrt-llm',
  'foundry-local',
] as const

const NAMES: Readonly<Record<string, string>> = {
  'llamacpp-upstream': 'llama.cpp',
  'llamacpp': 'llama.cpp TurboQuant',
  'atomic-prism': 'Atomic Prism',
  'mlx': 'MLX',
  'vllm': 'vLLM',
  'sglang': 'SGLang',
  'tensorrt-llm': 'TensorRT-LLM',
  'foundry-local': 'Foundry Local',
  'litert-lm': 'LiteRT-LM',
  'sd-cpp': 'stable-diffusion.cpp',
}

export const engineName = (id: string): string => NAMES[id] ?? id

/** `ids` in display order; a stable sort, so unknown engines keep the order they came in. */
export function orderEngines<T extends string>(ids: readonly T[]): T[] {
  const rank = (id: string) => {
    const i = (ORDER as readonly string[]).indexOf(id)
    return i < 0 ? ORDER.length : i
  }
  return [...ids].sort((a, b) => rank(a) - rank(b))
}

/**
 * What kind of engine `id` is, by the core's `ENGINE_KINDS`: llama.cpp's family, a managed engine
 * (container, plan, consent), Foundry Local (accelerators, variants), or an engine of builds.
 */
export function engineFamily(id: string): 'llamacpp' | 'managed' | 'foundry' | 'build' {
  if (id === 'foundry-local') return 'foundry'
  const kind = (ENGINE_KINDS as Readonly<Record<string, string>>)[id]
  return kind === 'llamacpp' ? 'llamacpp' : kind === 'managed' ? 'managed' : 'build'
}
