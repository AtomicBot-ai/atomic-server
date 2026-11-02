/** Verify every catalog file against its own immutable HF repository tree. No transfer happens here. */
import { createHash } from 'node:crypto'
import type { ArtifactPlan } from './artifact-plan.js'

interface Tree {
  sha: string
  siblings: { rfilename: string; size?: number; lfs?: { size: number; sha256: string } }[]
}

export async function artifactMetadata(
  plan: ArtifactPlan,
  request: typeof fetch,
  token?: string
): Promise<ArtifactPlan> {
  const trees = new Map<string, Promise<Tree>>()
  const files = await Promise.all(
    plan.files.map(async (item) => {
      const url = new URL(item.url)
      const match = /^\/([^/]+\/[^/]+)\/resolve\/([0-9a-f]{40})\/(.+)$/.exec(url.pathname)
      if (url.hostname !== 'huggingface.co' || !match)
        throw new Error('Model source has no immutable Hugging Face commit.')
      const repo = match[1]!,
        revision = match[2]!,
        encoded = match[3]!
      const path = decodeURIComponent(encoded)
      let reading = trees.get(`${repo}@${revision}`)
      if (!reading) {
        reading = (async () => {
          const response = await request(
            `https://huggingface.co/api/models/${repo}/revision/${revision}?blobs=true&files_metadata=true`,
            {
              signal: AbortSignal.timeout(15000),
              redirect: 'error',
              ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
            }
          )
          if (!response.ok) throw new Error(`Hugging Face metadata returned HTTP ${response.status}.`)
          const tree = (await response.json()) as Tree
          if (tree.sha !== revision || !Array.isArray(tree.siblings))
            throw new Error('Hugging Face did not confirm the selected model commit.')
          return tree
        })()
        trees.set(`${repo}@${revision}`, reading)
      }
      const tree = await reading
      const file = tree.siblings.find((file) => file.rfilename === path)
      const size = file?.lfs?.size ?? file?.size
      if (!file || !Number.isSafeInteger(size) || size! < 0)
        throw new Error(`Missing file metadata for ${repo}/${path}.`)
      if (
        (item.size !== null && item.size !== undefined && item.size !== size) ||
        (item.sha256 && file.lfs?.sha256 && item.sha256 !== file.lfs.sha256)
      )
        throw new Error(`Catalog metadata disagrees with ${repo}/${path}.`)
      return {
        ...item,
        size: size!,
        sha256: item.sha256 ?? file.lfs?.sha256 ?? null,
        source: { repo, revision, path, ...(item.source?.purpose ? { purpose: item.source.purpose } : {}) },
      }
    })
  )
  const body = {
    ...plan,
    version: 1 as const,
    files,
    total_download_bytes: files.reduce((sum, file) => sum + file.size, 0),
  }
  return {
    ...body,
    digest: createHash('sha256')
      .update(JSON.stringify({ ...body, digest: undefined, created_at: undefined }))
      .digest('hex'),
  }
}
