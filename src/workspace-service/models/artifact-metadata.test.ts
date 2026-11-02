import { describe, expect, it, vi } from 'vitest'
import { artifactMetadata } from './artifact-metadata.js'
import type { ArtifactPlan } from './artifact-plan.js'

const A = 'a'.repeat(40),
  B = 'b'.repeat(40),
  hash = 'c'.repeat(64)
const plan: ArtifactPlan = {
  digest: 'old',
  category: 'image',
  model_id: 'test:q4',
  name: 'Test',
  engine: 'diffusion',
  created_at: 1,
  files: [
    {
      url: `https://huggingface.co/a/model/resolve/${A}/weights.gguf`,
      save_path: 'models/weights.gguf',
      size: 4,
      sha256: hash,
    },
    {
      url: `https://huggingface.co/a/model/resolve/${A}/config.json`,
      save_path: 'models/config.json',
      size: 2,
    },
    { url: `https://huggingface.co/b/vae/resolve/${B}/vae.bin`, save_path: 'models/vae.bin', size: 3 },
  ],
  total_download_bytes: 9,
  load: {},
}
describe('artifact metadata before transfer', () => {
  it('checks each repository once at its own pin and records every file source', async () => {
    const request = vi.fn(async (url: Parameters<typeof fetch>[0]) =>
      Response.json(
        String(url).includes('a/model')
          ? {
              sha: A,
              siblings: [
                { rfilename: 'weights.gguf', lfs: { size: 4, sha256: hash } },
                { rfilename: 'config.json', size: 2 },
              ],
            }
          : { sha: B, siblings: [{ rfilename: 'vae.bin', size: 3 }] }
      )
    )
    const result = await artifactMetadata(plan, request, 'secret')
    expect(request).toHaveBeenCalledTimes(2)
    expect(result.files.map((file) => file.source?.revision)).toEqual([A, A, B])
    expect(result.digest).not.toBe(plan.digest)
    expect(result.total_download_bytes).toBe(9)
    expect(JSON.stringify(result)).not.toContain('secret')
  })
  it.each([
    { sha: B, siblings: [] },
    { sha: A, siblings: [{ rfilename: 'weights.gguf', size: 5 }] },
    { sha: A, siblings: [{ rfilename: 'weights.gguf', lfs: { size: 4, sha256: 'd'.repeat(64) } }] },
  ])('rejects substituted versions or metadata before a plan is saved', async (tree) => {
    await expect(
      artifactMetadata({ ...plan, files: [plan.files[0]!] }, async () => Response.json(tree))
    ).rejects.toThrow()
  })
})
