import { AtomicCoreError } from '@atomic-chat/core'
import { fetchHfGgufFiles, parseGgufShard, ModelRegistry } from '@atomic-chat/core/models'
import type { DataLayout } from '@atomic-chat/core/host'
import type { HubRepository } from './types.js'
export async function searchHub(
  query: string,
  request: typeof fetch,
  signal?: AbortSignal
): Promise<HubRepository[]> {
  const results = await Promise.allSettled(
    ['AtomicChat', ''].map(async (author) => {
      const url = new URL('https://huggingface.co/api/models')
      url.search = new URLSearchParams({
        search: query.trim().replace(/^AtomicChat\//i, ''),
        filter: 'gguf',
        sort: 'downloads',
        direction: '-1',
        limit: '60',
        ...(author ? { author } : {}),
      }).toString()
      const response = await request(url, {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
      })
      if (!response.ok)
        throw new Error(`Model catalog unavailable (HTTP ${response.status}). Retry when connected.`)
      const rows = (await response.json()) as HubRepository[]
      if (!Array.isArray(rows)) throw new Error('The model catalog returned an invalid response.')
      return rows
        .filter((r) => typeof r.id === 'string')
        .map((r) => ({ id: r.id, downloads: Number(r.downloads) || 0 }))
    })
  )
  if (results.every((r) => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason
  const rows = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  return rows
    .filter((r, i) => rows.findIndex((p) => p.id === r.id) === i)
    .sort((a, b) => Number(/^AtomicChat\//i.test(b.id)) - Number(/^AtomicChat\//i.test(a.id)))
}
/** Single GGUF files, the balanced quant first: a sharded set needs every shard, so none is offered. */
export async function modelFiles(repository: string, request: typeof fetch, signal?: AbortSignal) {
  return (
    await fetchHfGgufFiles(repository, {
      fetch: (input, init) =>
        request(input, {
          ...init,
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
        }),
    })
  )
    .filter((file) => !/mmproj|projector/i.test(file.filename) && !parseGgufShard(file.filename))
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
    ...(typeof e.yml['repository'] === 'string' ? { repository: e.yml['repository'] } : {}),
    ...(typeof e.yml['size_bytes'] === 'number' && e.yml['size_bytes'] > 0
      ? { size_bytes: e.yml['size_bytes'] }
      : {}),
  }))
}

/** The core's answer for a repository that has no GGUF file at all (not a failure to read it). */
export const isNoGguf = (error: unknown): boolean =>
  error instanceof AtomicCoreError && error.code === 'MODEL_NOT_FOUND' && /no gguf/i.test(error.message)
