import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { DownloadItem } from '../downloads/index.js'
import type { CatalogRow } from './catalog.js'
import type { ArtifactPlan } from './artifact-plan.js'
/** MLX needs the complete checkpoint; a GGUF file picker cannot install it. */
export async function mlxPlan(
  row: CatalogRow,
  dataFolder: string,
  request: typeof fetch
): Promise<ArtifactPlan> {
  if (row.source['format'] !== 'mlx' || !/^[\w.-]+\/[\w.-]+$/.test(row.id))
    throw new Error('Choose an MLX repository from the catalog.')
  const metadata = await request(`https://huggingface.co/api/models/${row.id}`, {
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  })
  if (!metadata.ok) throw new Error(`Model metadata returned HTTP ${metadata.status}.`)
  const info = (await metadata.json()) as { sha?: string }
  if (!info.sha || !/^[a-f0-9]{40,64}$/.test(info.sha))
    throw new Error('The repository has no immutable revision.')
  let url = `https://huggingface.co/api/models/${row.id}/tree/${info.sha}?recursive=true&expand=false&limit=1000`
  const files: DownloadItem[] = [],
    root = `workspace-models/mlx/${row.id}`
  for (let page = 0; url && page < 20; page++) {
    const response = await request(url, { signal: AbortSignal.timeout(20000), redirect: 'error' })
    if (!response.ok) throw new Error(`Checkpoint files returned HTTP ${response.status}.`)
    const rows = (await response.json()) as Array<{
      type: string
      path: string
      size: number
      lfs?: { oid?: string; size?: number }
    }>
    if (!Array.isArray(rows)) throw new Error('Invalid checkpoint file listing.')
    for (const file of rows) {
      if (
        file.type !== 'file' ||
        !/(?:\.safetensors|\.json|\.model|\.tiktoken|merges\.txt|vocab\.txt)$/.test(file.path)
      )
        continue
      if (file.path.startsWith('/') || file.path.split('/').some((p) => p === '..' || !p))
        throw new Error('Invalid checkpoint path.')
      files.push({
        url: `https://huggingface.co/${row.id}/resolve/${info.sha}/${file.path.split('/').map(encodeURIComponent).join('/')}`,
        save_path: `${root}/${file.path}`,
        size: file.lfs?.size ?? file.size,
        sha256: file.lfs?.oid ?? null,
      })
    }
    const next = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get('link') ?? '')?.[1]
    if (next && !next.startsWith(`https://huggingface.co/api/models/${row.id}/tree/`))
      throw new Error('Unexpected checkpoint pagination URL.')
    url = next ?? ''
  }
  if (url) throw new Error('The checkpoint contains too many files.')
  if (
    !files.some((f) => f.save_path.endsWith('.safetensors')) ||
    !files.some((f) => f.save_path.endsWith('/config.json'))
  )
    throw new Error('This repository is not a complete MLX checkpoint.')
  const base = {
    category: 'text',
    model_id: row.id,
    name: row.name,
    engine: 'mlx',
    files,
    total_download_bytes: files.reduce((n, f) => n + (f.size ?? 0), 0),
    load: { provider: 'mlx', model_id: row.id, model_path: join(dataFolder, root) },
  }
  return {
    ...base,
    digest: createHash('sha256').update(JSON.stringify(base)).digest('hex'),
    created_at: Date.now(),
  }
}
