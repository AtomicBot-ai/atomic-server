import { fetchHfGgufFiles, ModelRegistry } from '@atomic-chat/core/models'
import type { DataLayout } from '@atomic-chat/core/host'
import type { HubRepository } from './types.js'
export async function searchHub(
  query: string,
  request: typeof fetch,
  signal?: AbortSignal
): Promise<HubRepository[]> {
  const url = new URL('https://huggingface.co/api/models')
  url.search = new URLSearchParams({
    search: query.trim(),
    filter: 'gguf',
    sort: 'downloads',
    direction: '-1',
    limit: '20',
  }).toString()
  const response = await request(url, { signal: signal ?? AbortSignal.timeout(20000) })
  if (!response.ok)
    throw new Error(`Model catalog unavailable (HTTP ${response.status}). Retry when connected.`)
  const rows = (await response.json()) as HubRepository[]
  if (!Array.isArray(rows)) throw new Error('The model catalog returned an invalid response.')
  return rows
    .filter((r) => typeof r.id === 'string')
    .map((r) => ({ id: r.id, downloads: Number(r.downloads) || 0 }))
}
export async function modelFiles(repository: string, request: typeof fetch) {
  return (
    await fetchHfGgufFiles(repository, {
      fetch: (input, init) => request(input, { ...init, signal: AbortSignal.timeout(20000) }),
    })
  )
    .filter((file) => !/(?:mmproj|projector)|-\d{5}-of-\d{5}/i.test(file.filename))
    .sort(
      (a, b) => Number(!/Q4_K_M/i.test(a.filename)) - Number(!/Q4_K_M/i.test(b.filename)) || a.size - b.size
    )
}
export async function installedModels(layout: DataLayout) {
  const registry = new ModelRegistry(layout)
  const entries = await registry.listChatModels()
  return entries.map((e) => ({
    id: e.id,
    provider: typeof e.yml['atomic_runtime'] === 'object' ? 'atomic-prism' : 'llamacpp-upstream',
    name: String(e.yml.name ?? e.id),
  }))
}
