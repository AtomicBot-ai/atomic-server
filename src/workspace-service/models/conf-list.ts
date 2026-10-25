/**
 * A list atc reads from atomic-chat-conf (Foundry Local's and LiteRT-LM's models): fetched at most once
 * an hour and cached on disk; when conf cannot be read, or serves what this client refuses (a newer
 * `schema_version`), the last accepted copy is used, else conf's first release bundled here. A
 * `file://` URL is read from disk (a list not merged into conf yet).
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** One hour, the other conf registries' posture. */
export const CACHE_TTL_MS = 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 10_000

export interface ConfListResult<T> {
  list: T
  source: 'remote' | 'cache' | 'baseline'
  fetchedAt: number | null
  /** Why conf's answer was not used, when it was not. */
  error?: string
}

export interface ConfListOptions {
  /** `<atc>/cache/<name>.json`. */
  cachePath: string
  fetch: typeof fetch
  url?: string | undefined
  force?: boolean
  now?: () => number
}

export interface ConfListSpec<T> {
  /** Names the list in errors: "LiteRT-LM model list". */
  label: string
  defaultUrl: string
  parse: (raw: unknown) => T
  baseline: unknown
}

async function documentAt(url: string, label: string, request: typeof fetch): Promise<unknown> {
  if (url.startsWith('file://')) return JSON.parse(await readFile(fileURLToPath(url), 'utf8'))
  const response = await request(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`)
  return response.json()
}

/** A fresh cache (unless forced), else conf (cached when it parses), else the last accepted copy, else the baseline. */
export async function fetchConfList<T>(
  spec: ConfListSpec<T>,
  o: ConfListOptions
): Promise<ConfListResult<T>> {
  const now = o.now ?? Date.now
  const cached = await readFile(o.cachePath, 'utf8')
    .then((text) => JSON.parse(text) as { value: unknown; fetchedAt: number })
    .catch(() => null)
  const accepted = (() => {
    try {
      return cached ? spec.parse(cached.value) : null
    } catch {
      return null
    }
  })()
  if (!o.force && cached && accepted && now() - cached.fetchedAt < CACHE_TTL_MS)
    return { list: accepted, source: 'cache', fetchedAt: cached.fetchedAt }
  try {
    const raw = await documentAt(o.url ?? spec.defaultUrl, spec.label, o.fetch)
    const list = spec.parse(raw)
    const fetchedAt = now()
    await mkdir(dirname(o.cachePath), { recursive: true })
    await writeFile(`${o.cachePath}.tmp`, JSON.stringify({ value: raw, fetchedAt }))
    await rename(`${o.cachePath}.tmp`, o.cachePath)
    return { list, source: 'remote', fetchedAt }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (accepted && cached)
      return { list: accepted, source: 'cache', fetchedAt: cached.fetchedAt, error: message }
    return { list: spec.parse(spec.baseline), source: 'baseline', fetchedAt: null, error: message }
  }
}
