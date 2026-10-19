import { describe, expect, it } from 'vitest'
import { mlxPlan } from './mlx-plan.js'
import type { CatalogRow } from './catalog.js'

describe('mlxPlan', () => {
  // The id becomes the folder under workspace-models/mlx: `owner/..` would write outside it.
  it.each(['owner/..', './repo', 'owner/repo/extra'])('refuses %s as a repository', async (id) => {
    const row = { id, source: { format: 'mlx' } } as unknown as CatalogRow
    const noHub = (async () => expect.fail('no Hub request for an invalid id')) as typeof fetch
    await expect(mlxPlan(row, '/data', noHub)).rejects.toThrow('Choose an MLX repository')
  })
})
