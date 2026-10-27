import { describe, expect, it } from 'vitest'
import { listingRoute, localRows } from './engine-listing.js'

const HERE = [
  { engine: 'llamacpp-upstream', kind: 'llamacpp' },
  { engine: 'mlx', kind: 'engine-build' },
  { engine: 'litert-lm', kind: 'engine-build' },
]

describe('listingRoute', () => {
  it.each([
    ['no engine: the whole catalog', undefined, 'all'],
    ['LiteRT-LM has its own list', 'litert-lm', 'litert'],
    ['Foundry Local has its own list', 'foundry-local', 'foundry'],
    ['a managed engine reads its descriptor', 'vllm', 'managed'],
    ['MLX filters the catalog', 'mlx', 'local'],
    ['llama.cpp filters the catalog', 'llamacpp', 'local'],
  ])('%s', (_name, engine, expected) => {
    expect(listingRoute(engine)).toBe(expected)
  })

  it('refuses an engine the core does not know, naming the known ones', () => {
    expect(() => listingRoute('bogus')).toThrow(
      expect.objectContaining({ code: 'ATC_USAGE', hint: expect.stringMatching(/llamacpp-upstream.*mlx/) })
    )
  })
})

describe('localRows', () => {
  const rows = [
    {
      id: 'AtomicChat/Qwen3.8-27B-GGUF',
      name: 'Qwen3.8 27B',
      description: 'Hybrid',
      category: 'text',
      source: { format: 'gguf' },
    },
    {
      id: 'AtomicChat/Qwen3.6-27B-MLX-4bit',
      name: 'Qwen3.6 27B',
      description: 'MLX',
      category: 'text',
      source: { format: 'mlx' },
    },
    {
      id: 'prism-ml/Bonsai-8B-GGUF',
      name: 'Bonsai 8B',
      description: 'Prism',
      category: 'text',
      source: { format: 'gguf', engine: 'atomic-prism' },
    },
  ]
  it.each([
    ['mlx', '', ['AtomicChat/Qwen3.6-27B-MLX-4bit']],
    ['llamacpp-upstream', '', ['AtomicChat/Qwen3.8-27B-GGUF']],
    ['llamacpp', '', ['AtomicChat/Qwen3.8-27B-GGUF']],
    ['atomic-prism', '', ['prism-ml/Bonsai-8B-GGUF']],
    ['mlx', 'gemma', []],
    ['llamacpp-upstream', 'qwen', ['AtomicChat/Qwen3.8-27B-GGUF']],
  ])('keeps the rows %s runs, matching %j', (engine, query, expected) => {
    expect(localRows(rows, engine, query).map((r) => r.id)).toEqual(expected)
  })
  void HERE
})
