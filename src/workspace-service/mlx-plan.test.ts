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

const SHA = 'a'.repeat(40)
const row = {
  id: 'mlx-community/Qwen3-0.6B-4bit',
  name: 'Qwen3',
  source: { format: 'mlx' },
} as unknown as CatalogRow
type Listing = Array<{ type: string; path: string; size: number; lfs?: { oid?: string; size?: number } }>
/** The Hub: metadata, then the tree in pages (each page may name the next one in `link`). */
function hub(pages: Listing[], options: { sha?: string; metadataStatus?: number; next?: string } = {}) {
  const urls: string[] = []
  const request = (async (input: string | URL) => {
    const url = String(input)
    urls.push(url)
    if (url === `https://huggingface.co/api/models/${row.id}`)
      return Response.json({ sha: options.sha ?? SHA }, { status: options.metadataStatus ?? 200 })
    const page = Number(new URL(url).searchParams.get('cursor') ?? 0)
    const link =
      page + 1 < pages.length
        ? `<${options.next ?? `https://huggingface.co/api/models/${row.id}/tree/${SHA}`}?cursor=${page + 1}>; rel="next"`
        : ''
    return Response.json(pages[page], { headers: link ? { link } : {} })
  }) as typeof fetch
  return { request, urls }
}
const checkpoint: Listing = [
  { type: 'file', path: 'config.json', size: 10 },
  { type: 'file', path: 'model.safetensors', size: 999, lfs: { oid: 'b'.repeat(64), size: 1000 } },
  { type: 'file', path: 'README.md', size: 5 },
  { type: 'directory', path: 'sub', size: 0 },
  { type: 'file', path: 'sub/tokenizer.json', size: 20 },
]

describe('mlxPlan from the Hub', () => {
  it('plans the checkpoint files at the immutable revision, sized and hashed from LFS', async () => {
    const { request } = hub([checkpoint])
    const plan = await mlxPlan(row, '/data', request)
    expect(plan).toMatchObject({
      category: 'text',
      model_id: row.id,
      engine: 'mlx',
      total_download_bytes: 1030,
      load: { provider: 'mlx', model_id: row.id, model_path: `/data/workspace-models/mlx/${row.id}` },
      digest: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(plan.files).toEqual([
      {
        url: `https://huggingface.co/${row.id}/resolve/${SHA}/config.json`,
        save_path: `workspace-models/mlx/${row.id}/config.json`,
        size: 10,
        sha256: null,
      },
      {
        url: `https://huggingface.co/${row.id}/resolve/${SHA}/model.safetensors`,
        save_path: `workspace-models/mlx/${row.id}/model.safetensors`,
        size: 1000,
        sha256: 'b'.repeat(64),
      },
      {
        url: `https://huggingface.co/${row.id}/resolve/${SHA}/sub/tokenizer.json`,
        save_path: `workspace-models/mlx/${row.id}/sub/tokenizer.json`,
        size: 20,
        sha256: null,
      },
    ])
  })

  it('gives the same digest for the same checkpoint', async () => {
    const a = await mlxPlan(row, '/data', hub([checkpoint]).request)
    const b = await mlxPlan(row, '/data', hub([checkpoint]).request)
    expect(a.digest).toBe(b.digest)
  })

  it('follows the Hub’s pages', async () => {
    const { request, urls } = hub([[checkpoint[0]!], [checkpoint[1]!]])
    expect((await mlxPlan(row, '/data', request)).files).toHaveLength(2)
    expect(urls).toHaveLength(3)
  })

  it.each([
    ['metadata fails', [checkpoint], { metadataStatus: 404 }, 'Model metadata returned HTTP 404.'],
    [
      'the revision is not a commit',
      [checkpoint],
      { sha: 'main' },
      'The repository has no immutable revision.',
    ],
    [
      'a page points off the repository',
      [checkpoint, checkpoint],
      { next: 'https://elsewhere.test/tree' },
      'Unexpected checkpoint pagination URL.',
    ],
    [
      'a path climbs out',
      [[{ type: 'file', path: '../evil.json', size: 1 }]],
      {},
      'Invalid checkpoint path.',
    ],
    [
      'there are no weights',
      [[{ type: 'file', path: 'config.json', size: 1 }]],
      {},
      'This repository is not a complete MLX checkpoint.',
    ],
    [
      'there are more than 20 pages',
      Array.from({ length: 21 }, () => checkpoint),
      {},
      'The checkpoint contains too many files.',
    ],
  ])('refuses when %s', async (_, pages, options, message) => {
    await expect(mlxPlan(row, '/data', hub(pages as Listing[], options).request)).rejects.toThrow(message)
  })
})
