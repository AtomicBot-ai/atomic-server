/** The Local models filter, the same in the web admin and the terminal UI. */

/**
 * The engines a catalog model runs on: its own providers, else the one its format implies (MLX; Prism's
 * Bonsai builds on atomic-prism; any other GGUF on upstream llama.cpp).
 */
export function modelEngines(providers: readonly string[], format: string, id: string): string[] {
  if (providers.length) return [...providers]
  return [format === 'mlx' ? 'mlx' : /prism|bonsai/i.test(id) ? 'atomic-prism' : 'llamacpp-upstream']
}

/** The engine filter keeps a model on that engine; `llamacpp` also keeps upstream llama.cpp's. */
export function matchesEngineFilter(filter: string, engines: readonly string[]): boolean {
  return (
    !filter || engines.includes(filter) || (filter === 'llamacpp' && engines.includes('llamacpp-upstream'))
  )
}

export const mentionsUncensored = (text: string) => /uncensored|abliterated/i.test(text)

/** The liked models after a model's heart is pressed. */
export const toggleLike = (likes: readonly string[], id: string): string[] =>
  likes.includes(id) ? likes.filter((item) => item !== id) : [...likes, id]
