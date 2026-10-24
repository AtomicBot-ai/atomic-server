import { expect, it } from 'vitest'
import {
  installedModels,
  matchesCatalogModel,
  modelCategory,
  modelFormat,
  modelId,
  modelLikes,
  modelProviders,
} from './catalog-models'

it('keeps artifact job identity while reconciling its model metadata with installed models', () => {
  const rows = installedModels(
    [{ id: 'local/mlx', provider: 'mlx' }],
    [
      {
        id: 'mlx-job',
        stage: 'ready',
        plan: { model_id: 'local/mlx', category: 'text', engine: 'mlx', name: 'MLX model' },
      },
      {
        id: 'image-job',
        stage: 'ready',
        plan: {
          model_id: 'flux:q4',
          category: 'image',
          engine: 'sd-cpp',
          name: 'Flux',
          total_download_bytes: 300,
        },
      },
      { id: 'pending', stage: 'downloading', plan: { model_id: 'video', category: 'video' } },
    ]
  )
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({ id: 'mlx-job', model_id: 'local/mlx', provider: 'mlx' })
  expect(rows[1]).toMatchObject({ id: 'image-job', model_id: 'flux:q4', category: 'image', size_bytes: 300 })
  expect(modelId(rows[1]!)).toBe('flux:q4')
  expect(modelCategory(rows[0]!)).toBe('text')
})

it.each([
  ['flux:q4', 'flux', true],
  ['flux:fp16', 'flux', true],
  ['repo/model/q4.gguf', 'repo/model', true],
  ['repo/model', 'repo/model', true],
  ['flux-next:q4', 'flux', false],
  ['repo/model-new', 'repo/model', false],
])('matches installed %s to catalog family %s: %s', (id, family, expected) => {
  expect(matchesCatalogModel(id, family)).toBe(expected)
})

it.each([
  [{ id: 'imported', providers: ['llamacpp-upstream'] }, 'gguf'],
  [{ id: 'imported-mlx', provider: 'mlx' }, 'mlx'],
  [{ id: 'job', plan: { model_id: 'mlx-id', category: 'text', engine: 'mlx' } }, 'mlx'],
  [{ id: 'managed', store: 'managed', providers: ['vllm', 'sglang'] }, 'safetensors'],
  [{ id: 'phi', providers: ['foundry-local'] }, 'foundry'],
])('infers installed format from engine metadata: %j', (model, format) => {
  expect(modelFormat(model)).toBe(format)
})

it('uses installed provider capabilities and plan engines without inventing a provider', () => {
  expect(modelProviders({ providers: ['vllm', 'sglang'], provider: 'vllm' })).toEqual(['vllm', 'sglang'])
  expect(modelProviders({ plan: { engine: 'mlx' } })).toEqual(['mlx'])
  expect(modelProviders({ id: 'unknown', providers: [] })).toEqual([])
})

it.each(['null', '{}', 'false', 'broken', '42'])('ignores invalid saved likes: %s', (value) => {
  expect(modelLikes(value)).toEqual([])
})

it('retains only string identifiers from saved likes', () => {
  expect(modelLikes('["repo/model",null,42]')).toEqual(['repo/model'])
})
