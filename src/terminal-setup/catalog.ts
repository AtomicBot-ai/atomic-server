import { AtcError } from '../errors/index.js'
import { AtomicCoreError } from '@atomic-chat/core'
import { fetchHfGgufFiles, parseGgufShard, ModelRegistry } from '@atomic-chat/core/models'
import type { DataLayout } from '@atomic-chat/core/host'
import type { HubRepository } from './types.js'
/** Transport codes that mean nothing answered the connection; the runtime's fetch keeps them on its cause. */
const UNREACHABLE = new Set([
  'ECONNREFUSED',
  'ConnectionRefused',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ETIMEDOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
])
/** The transport code of a failed request: on the rejection itself or on one of its causes, up to five deep. */
function unreachableCode(error: unknown): string | undefined {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth++) {
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string' && UNREACHABLE.has(code)) return code
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}
export async function searchHub(
  query: string,
  request: typeof fetch,
  signal?: AbortSignal,
  format: 'gguf' | 'mlx' = 'gguf'
): Promise<HubRepository[]> {
  const results = await Promise.allSettled(
    (format === 'mlx' ? ['mlx-community', ''] : ['AtomicChat', '']).map(async (author) => {
      const url = new URL('https://huggingface.co/api/models')
      url.search = new URLSearchParams({
        search: query.trim().replace(/^AtomicChat\//i, ''),
        filter: format,
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
        .map((r) => ({
          id: r.id,
          downloads: Number(r.downloads) || 0,
          ...(format === 'mlx' ? { source: { format: 'mlx' as const } } : {}),
        }))
    })
  )
  if (results.every((r) => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason
  const rows = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  return rows
    .filter((r, i) => rows.findIndex((p) => p.id === r.id) === i)
    .sort((a, b) => Number(/^AtomicChat\//i.test(b.id)) - Number(/^AtomicChat\//i.test(a.id)))
}
/** Single GGUF files, the balanced quant first: a sharded set needs every shard, so none is offered. */
export async function modelFiles(
  repository: string,
  request: typeof fetch,
  signal?: AbortSignal,
  revision?: string
) {
  return (
    await fetchHfGgufFiles(repository, {
      ...(revision ? { revision } : {}),
      fetch: (input, init) =>
        request(input, {
          ...init,
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
        }),
    }).catch((error) => {
      if (error instanceof AtomicCoreError && /HTTP (401|403)/.test(error.message))
        throw new AtcError('ATC_USAGE', error.message, {
          details: error.details ?? 'Set HF_TOKEN for a gated repository.',
        })
      const code = unreachableCode(error)
      if (code)
        throw new AtcError('ATC_USAGE', 'Could not reach Hugging Face for this repository.', {
          details: `Network error: ${code}`,
          hint: 'Check this machine’s network or proxy, then retry.',
        })
      throw error
    })
  )
    .filter(
      (file) => !/mmproj|projector/i.test(file.filename) && (parseGgufShard(file.filename)?.index ?? 1) === 1
    )
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
