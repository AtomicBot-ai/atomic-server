import { describe, expect, it } from 'vitest'
import { engineModels } from './setup-data'

const ids = (models: { id?: unknown }[]) => models.map((m) => m.id)

// The catalog is already filtered by category; the engine narrows it further.
describe('engineModels', () => {
  const text = [
    { id: 'gguf', source: { format: 'gguf' } },
    { id: 'mlx', source: { format: 'mlx' } },
  ]
  it.each([
    ['llamacpp-upstream', ['gguf']],
    ['llamacpp', ['gguf']],
    ['mlx', ['mlx']],
  ])('text models for %s are %j', (engine, expected) =>
    expect(ids(engineModels(text, engine, 'text'))).toEqual(expected)
  )

  it('offers image and video models on stable-diffusion.cpp only', () => {
    const image = [{ id: 'flux', source: {} }]
    expect(ids(engineModels(image, 'sd-cpp', 'image'))).toEqual(['flux'])
    expect(ids(engineModels(image, 'llamacpp-upstream', 'video'))).toEqual([])
  })

  it('matches other workloads on their engine, defaulting by category', () => {
    const embedding = [
      { id: 'default', source: {} },
      { id: 'tuned', source: { engine: 'llamacpp' } },
    ]
    expect(ids(engineModels(embedding, 'llamacpp-upstream', 'embedding'))).toEqual(['default'])
    expect(ids(engineModels(embedding, 'llamacpp', 'decision'))).toEqual(['default', 'tuned'])
  })
})
