import { describe, expect, it } from 'vitest'
import {
  CATALOG_FORMAT_LABELS,
  catalogFormatsFor,
  engineCatalogFormat,
  FORMAT_ENGINE,
} from './catalog-formats.js'

describe('catalog formats', () => {
  it.each([
    ['llamacpp-upstream', 'gguf'],
    ['atomic-prism', 'gguf'],
    ['mlx', 'mlx'],
    ['vllm', 'safetensors'],
    ['foundry-local', 'foundry'],
    ['litert-lm', 'litert'],
    ['an-engine-of-tomorrow', 'gguf'],
  ])('%s runs the %s format', (engine, format) => {
    expect(engineCatalogFormat(engine)).toBe(format)
  })

  it('offers GGUF, then what the engines here run, in one order', () => {
    expect(catalogFormatsFor(['llamacpp-upstream'])).toEqual(['gguf'])
    expect(catalogFormatsFor(['litert-lm', 'foundry-local', 'sglang', 'mlx', 'llamacpp'])).toEqual([
      'gguf',
      'mlx',
      'safetensors',
      'foundry',
      'litert',
    ])
  })

  it('names every format and reads Foundry Local and LiteRT-LM from their own engine', () => {
    expect(CATALOG_FORMAT_LABELS).toEqual({
      gguf: 'GGUF',
      mlx: 'MLX',
      safetensors: 'Safetensors',
      foundry: 'Foundry Local',
      litert: 'LiteRT-LM',
    })
    expect(FORMAT_ENGINE).toEqual({ foundry: 'foundry-local', litert: 'litert-lm' })
  })
})
