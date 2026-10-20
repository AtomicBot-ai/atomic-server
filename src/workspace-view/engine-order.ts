/**
 * Engines in the order and by the names both UIs show them (spec server-engine-settings): llama.cpp's
 * family first, MLX, then the managed engines in the desktop app's order (vLLM, SGLang, TensorRT-LLM),
 * then Foundry Local; an engine this list does not know goes last, as given. Which engines exist is the
 * core's answer (`engines.list`), never this list.
 */

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
