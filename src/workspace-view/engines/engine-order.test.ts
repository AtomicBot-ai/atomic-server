import { describe, expect, it } from 'vitest'
import { engineFamily, engineHasSettings, engineName, engineTaskNote, orderEngines } from './engine-order.js'

describe('engine order and names', () => {
  it('puts llama.cpp first, then MLX, the managed engines as the desktop app does, then Foundry Local and LiteRT-LM', () => {
    expect(
      orderEngines([
        'litert-lm',
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
      'litert-lm',
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
    ['litert-lm', 'litert'],
    ['mlx', 'build'],
    ['something-new', 'build'],
  ])('%s is %s, by the core’s kinds', (id, family) => expect(engineFamily(id)).toBe(family))
})

describe('engines that take their settings with each task', () => {
  it.each(['sd-cpp', 'audio-cpp'])('%s has no provider settings, and says so', (engine) => {
    expect(engineHasSettings(engine)).toBe(false)
    expect(engineTaskNote(engine)).toBeTruthy()
  })

  it('leaves every other engine its settings', () => {
    expect(engineHasSettings('llamacpp-upstream')).toBe(true)
    expect(engineTaskNote('llamacpp-upstream')).toBeUndefined()
  })

  it('names audio.cpp, and treats it as an engine of builds beside sd.cpp', () => {
    expect(engineName('audio-cpp')).toBe('audio.cpp')
    expect(engineFamily('audio-cpp')).toBe('build')
    expect(orderEngines(['mlx', 'sd-cpp', 'audio-cpp'])).toEqual(['mlx', 'sd-cpp', 'audio-cpp'])
  })
})
