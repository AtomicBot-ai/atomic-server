/**
 * Engines in the order and by the names both UIs show them (spec server-engine-settings): llama.cpp's
 * family first, MLX, then the managed engines in the desktop app's order (vLLM, SGLang, TensorRT-LLM),
 * then Foundry Local and LiteRT-LM; an engine this list does not know goes last, as given. Which engines exist is the
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
  'litert-lm',
  'geniex',
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
  'geniex': 'GenieX',
  'sd-cpp': 'stable-diffusion.cpp',
  'audio-cpp': 'audio.cpp',
}

export const engineName = (id: string): string => NAMES[id] ?? id

/** Engines that take their settings with each task: they have no provider settings in the core. */
const TASK_SETTINGS: Readonly<Record<string, string>> = {
  'sd-cpp': 'Generation settings are saved with image and video tasks.',
  'audio-cpp': 'Generation settings are sent with each audio task.',
}

export const engineHasSettings = (id: string): boolean => !(id in TASK_SETTINGS)

/** What an engine's panel says about its settings when it has none to edit. */
export const engineTaskNote = (id: string): string | undefined => TASK_SETTINGS[id]

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
 * (container, plan, consent), Foundry Local or LiteRT-LM (accelerators, variants), or an engine of builds.
 */
export function engineFamily(id: string): 'llamacpp' | 'managed' | 'foundry' | 'litert' | 'geniex' | 'build' {
  if (id === 'foundry-local') return 'foundry'
  if (id === 'geniex') return 'geniex'
  if (id === 'litert-lm') return 'litert'
  const kind = (ENGINE_KINDS as Readonly<Record<string, string>>)[id]
  return kind === 'llamacpp' ? 'llamacpp' : kind === 'managed' ? 'managed' : 'build'
}
