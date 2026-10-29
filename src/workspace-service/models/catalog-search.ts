import { searchHub } from '../../terminal-setup/index.js'
import type { WorkspaceCatalog } from './catalog.js'

/** Keep curated display-name matches ahead of Hub repositories, using the requested model format. */
export async function searchCatalog(
  catalog: WorkspaceCatalog,
  query: string,
  request: typeof fetch,
  mlx: boolean
) {
  const format = mlx ? 'mlx' : 'gguf'
  const [curated, remote] = await Promise.allSettled([
    catalog.list('text', query),
    searchHub(query, request, undefined, format),
  ])
  const picks =
    curated.status === 'fulfilled'
      ? curated.value.rows.filter((row) => (row.source['format'] ?? 'gguf') === format)
      : []
  if (remote.status === 'rejected' && !picks.length) throw remote.reason
  const rows = [...picks, ...(remote.status === 'fulfilled' ? remote.value : [])]
  return { rows: rows.filter((row, index) => rows.findIndex((r) => r.id === row.id) === index) }
}
