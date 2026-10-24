import { describe, expect, it } from 'vitest'
import { engineFamily, engineName, orderEngines } from './engine-order.js'

describe('engine order and names', () => {
  it('puts llama.cpp first, then MLX, the managed engines as the desktop app does, then Foundry Local', () => {
    expect(
      orderEngines([
        'foundry-local',
        'tensorrt-llm',
        'sglang',
        'vllm',
        'mlx',
        'atomic-prism',
        'llamacpp',
        'llamacpp-upstream',
      ])
    ).toEqual([
      'llamacpp-upstream',
      'llamacpp',
      'atomic-prism',
      'mlx',
      'vllm',
      'sglang',
      'tensorrt-llm',
      'foundry-local',
    ])
  })

  it('keeps an engine it does not know after the ones it does, in the order given', () => {
    expect(orderEngines(['new-b', 'vllm', 'new-a'])).toEqual(['vllm', 'new-b', 'new-a'])
  })

  it.each([
    ['llamacpp-upstream', 'llama.cpp'],
    ['llamacpp', 'llama.cpp TurboQuant'],
    ['vllm', 'vLLM'],
    ['sglang', 'SGLang'],
    ['tensorrt-llm', 'TensorRT-LLM'],
    ['foundry-local', 'Foundry Local'],
    ['litert-lm', 'LiteRT-LM'],
    ['something', 'something'],
  ])('%s is %s', (id, name) => expect(engineName(id)).toBe(name))
})

describe('engineFamily', () => {
  it.each([
    ['llamacpp-upstream', 'llamacpp'],
    ['atomic-prism', 'llamacpp'],
    ['vllm', 'managed'],
    ['tensorrt-llm', 'managed'],
    ['foundry-local', 'foundry'],
    ['mlx', 'build'],
    ['litert-lm', 'build'],
    ['something-new', 'build'],
  ])('%s is %s, by the core’s kinds', (id, family) => expect(engineFamily(id)).toBe(family))
})
