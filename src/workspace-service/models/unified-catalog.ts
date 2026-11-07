/** One complete conf document, shared by every server-side collection adapter. */
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  ATOMIC_MODEL_CATALOG_URL,
  parseAtomicModelCatalog,
  projectAtomicModelCollection,
} from '@atomic-chat/core/client'
import type { AtomicModelCatalog } from '@atomic-chat/core/client'
import { readDocument, writeDocument } from '../../terminal-data/index.js'
import baseline from './model-catalog-baseline.json' with { type: 'json' }

export interface UnifiedCatalogResult {
  catalog: AtomicModelCatalog
  source: 'remote' | 'cache' | 'baseline'
  fetchedAt: number | null
  error?: string
}
interface Saved {
  catalog: AtomicModelCatalog
  at: number
}
const TTL = 60 * 60 * 1000
const inFlight = new Map<string, Promise<UnifiedCatalogResult>>()

/** The cache contains the complete new format; projected legacy shapes are never persisted. */
export async function unifiedCatalog(
  directory: string,
  request: typeof fetch,
  force = false,
  url = ATOMIC_MODEL_CATALOG_URL
): Promise<UnifiedCatalogResult> {
  const suffix =
    url === ATOMIC_MODEL_CATALOG_URL ? '' : '-' + createHash('sha256').update(url).digest('hex').slice(0, 16)
  const path = join(directory, `atomic-model-catalog-v1${suffix}.json`)
  const key = `${path}|${url}`
  const running = inFlight.get(key)
  if (running && !force) return running
  const reading = (async () => {
    const saved = await readDocument<Saved | null>(path, null)
    let cached: Saved | undefined
    try {
      if (saved) cached = { ...saved, catalog: parseAtomicModelCatalog(saved.catalog) }
    } catch {
      /* Ignore an invalid cache. */
    }
    if (!force && cached && Date.now() - cached.at < TTL)
      return { catalog: cached.catalog, source: 'cache' as const, fetchedAt: cached.at }
    try {
      let raw: unknown
      if (url.startsWith('file://')) raw = JSON.parse(await readFile(fileURLToPath(url), 'utf8'))
      else {
        const response = await request(url, { signal: AbortSignal.timeout(10000), redirect: 'error' })
        if (!response.ok) throw new Error(`Model catalog returned HTTP ${response.status}`)
        raw = await response.json()
      }
      const catalog = parseAtomicModelCatalog(raw)
      const at = Date.now()
      await writeDocument(path, { catalog, at })
      return { catalog, source: 'remote' as const, fetchedAt: at }
    } catch (error) {
      return {
        catalog: cached?.catalog ?? parseAtomicModelCatalog(baseline),
        source: cached ? ('cache' as const) : ('baseline' as const),
        fetchedAt: cached?.at ?? null,
        error: String(error),
      }
    }
  })()
  inFlight.set(key, reading)
  try {
    return await reading
  } finally {
    inFlight.delete(key)
  }
}

/** Adapt existing engine/UI contracts without additional remote files. */
export async function unifiedCollection(
  name: string,
  directory: string,
  request: typeof fetch,
  force = false,
  url?: string
) {
  const result = await unifiedCatalog(directory, request, force, url)
  return { ...result, value: projectAtomicModelCollection(result.catalog, name) }
}

export function unifiedCatalogBaseline(): AtomicModelCatalog {
  return parseAtomicModelCatalog(baseline)
}
