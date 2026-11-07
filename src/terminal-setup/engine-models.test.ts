import { expect, it, vi } from 'vitest'
import { engineModels } from './engine-models.js'

it.each([
  ['llamacpp-upstream', 'org/normal'],
  ['llamacpp', 'org/normal'],
  ['atomic-prism', 'org/Bonsai'],
  ['mlx', 'org/mlx'],
])('uses %s recommendations without mixing other engines', async (engine, id) => {
  const execute = vi.fn(async () => ({
    rows: [
      { id: 'org/normal', name: 'Normal', source: { format: 'gguf' } },
      { id: 'org/Bonsai', name: 'Bonsai', source: { format: 'gguf' } },
      { id: 'org/mlx', name: 'MLX', source: { format: 'mlx' } },
    ],
  }))
  expect((await engineModels({ execute }, engine + '|version|variant', '')).map((row) => row.id)).toEqual([
    id,
  ])
  expect(execute).toHaveBeenCalledWith('models.catalog', { category: 'text' })
})
