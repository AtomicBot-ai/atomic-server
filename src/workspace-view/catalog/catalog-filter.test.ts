import { describe, expect, it } from 'vitest'
import { matchesEngineFilter, modelEngines, mentionsUncensored, toggleLike } from './catalog-filter.js'

describe('the Local models filter both clients apply', () => {
  it.each([
    [['vllm', 'sglang'], 'safetensors', 'repo/model', ['vllm', 'sglang']],
    [[], 'mlx', 'repo/model', ['mlx']],
    [[], 'gguf', 'prism-ml/Bonsai-8B', ['atomic-prism']],
    [[], 'gguf', 'Qwen/Qwen3-4B', ['llamacpp-upstream']],
  ])('runs %j (%s, %s) on %j', (providers, format, id, engines) => {
    expect(modelEngines(providers, format, id)).toEqual(engines)
  })

  it.each([
    ['', ['vllm'], true],
    ['vllm', ['vllm', 'sglang'], true],
    ['sglang', ['vllm'], false],
    ['llamacpp', ['llamacpp-upstream'], true],
  ])('filter %j keeps a model on %j: %s', (filter, engines, kept) => {
    expect(matchesEngineFilter(filter, engines)).toBe(kept)
  })

  it('finds uncensored and abliterated models by any of their text', () => {
    expect(mentionsUncensored('Llama-3-8B-Abliterated')).toBe(true)
    expect(mentionsUncensored('an uncensored fine-tune')).toBe(true)
    expect(mentionsUncensored('Qwen3-4B')).toBe(false)
  })

  it('likes a model once and unlikes it again, keeping the others in order', () => {
    expect(toggleLike(['a', 'b'], 'c')).toEqual(['a', 'b', 'c'])
    expect(toggleLike(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })
})
