/**
 * Finding LiteRT-LM models (spec `litert-lm-server`, "Модели LiteRT-LM в atc"): conf's curated list —
 * the catalog shows nothing else — and for a search, then Hugging Face's repositories of conf's
 * organisations, marked unverified. Each model's variants for this host's platform carry the core's
 * verdict (`POST /models/litert-lm/check`), and the default one is NPU, then GPU, then CPU among those
 * that run or will once prepared. A Hub that cannot be read leaves the curated list alone; a list conf
 * cannot serve falls back to the last copy, and the result says so.
 */

import type { LiteRtLmBackendId, LiteRtLmCheckResult } from '@atomic-chat/core/contracts'
import type { LiteRtModelRow, LiteRtSearchResult, LiteRtVariantRow } from '../../contract/index.js'
import type { CoreLink } from '../../core-link/index.js'
import { unavailableHere } from '../engines/engine-install.js'
import type { ConfListOptions } from '../models/conf-list.js'
import { hfLiteRtRepositories, hfVariants, uniqueHfIds } from './litert-hf.js'
import { fetchLiteRtLmList } from './litert-list.js'
import type { LiteRtLmPlatform } from './litert-list.js'

export interface LiteRtSearchDeps {
  link: CoreLink
  fetch: typeof fetch
  list: Omit<ConfListOptions, 'fetch'>
  platform: string
  arch: string
  /** The Hub (`HF_ENDPOINT` or Hugging Face) and `HF_TOKEN`, sent there only. */
  hub: string
  token?: string | undefined
}

const unavailable = () => unavailableHere('litert-lm')

/** This machine as conf names platforms; `null` where the library does not ship. */
export function liteRtPlatform(platform: string, arch: string): LiteRtLmPlatform | null {
  if (platform === 'darwin') return arch === 'arm64' ? 'macos-arm64' : null
  if (platform === 'win32') return arch === 'x64' ? 'win-x64' : null
  if (platform === 'linux') return arch === 'arm64' ? 'linux-arm64' : arch === 'x64' ? 'linux-x64' : null
  return null
}

const ORDER: Record<LiteRtLmBackendId, number> = { npu: 0, gpu: 1, cpu: 2 }
export function defaultLiteRtVariant(variants: readonly LiteRtVariantRow[]): LiteRtVariantRow | undefined {
  return variants
    .filter((v) => v.verdict.verdict === 'ok' || v.verdict.verdict === 'accelerator-not-prepared')
    .sort((a, b) => ORDER[a.backend] - ORDER[b.backend])[0]
}

/** Every word of the query in the model's id, name, summary or repository, case aside. */
const matches = (row: Pick<LiteRtModelRow, 'model_id' | 'name' | 'summary' | 'repo'>, query: string) =>
  query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => `${row.model_id} ${row.name} ${row.summary} ${row.repo}`.toLowerCase().includes(w))

/** `huggingface`: a search; without it, the catalog (conf's list alone, the Hub never asked). */
export async function liteRtSearch(
  d: LiteRtSearchDeps,
  o: { query?: string; huggingface: boolean }
): Promise<LiteRtSearchResult> {
  const { engines } = await d.link.request<{ engines?: Array<{ engine: string }> }>(
    'POST',
    '/engines/versions',
    {}
  )
  if (!(engines ?? []).some((e) => e.engine === 'litert-lm')) throw unavailable()
  const platform = liteRtPlatform(d.platform, d.arch)
  if (!platform) throw unavailable()
  const query = o.query ?? ''
  const listed = await fetchLiteRtLmList({ ...d.list, fetch: d.fetch })
  const verdicts = new Map<string, Promise<LiteRtLmCheckResult>>()
  const verdictOf = (v: Pick<LiteRtVariantRow, 'backend' | 'npu' | 'min_runtime_version'>) => {
    const body = {
      backend: v.backend,
      ...(v.npu ? { npu: v.npu } : {}),
      ...(v.min_runtime_version ? { min_runtime_version: v.min_runtime_version } : {}),
    }
    const key = JSON.stringify(body)
    if (!verdicts.has(key))
      verdicts.set(key, d.link.request<LiteRtLmCheckResult>('POST', '/models/litert-lm/check', body))
    return verdicts.get(key)!
  }
  const rows: LiteRtModelRow[] = []
  // conf's ids, on every platform: what a Hugging Face variant must not take, the same for every query.
  const curatedIds = new Set(listed.list.models.flatMap((m) => m.variants.map((v) => v.id)))
  const add = async (
    base: Omit<LiteRtModelRow, 'variants' | 'default_variant'>,
    variants: Omit<LiteRtVariantRow, 'verdict'>[]
  ) => {
    if (variants.length === 0) return
    const withVerdicts = await Promise.all(variants.map(async (v) => ({ ...v, verdict: await verdictOf(v) })))
    rows.push({
      ...base,
      variants: withVerdicts,
      default_variant: defaultLiteRtVariant(withVerdicts)?.id ?? null,
    })
  }
  for (const m of listed.list.models) {
    const base = {
      origin: 'curated' as const,
      model_id: m.id,
      name: m.name,
      summary: m.description,
      license: m.license,
      gated: m.gated,
      unverified: false,
      repo: m.repo,
      revision: m.revision,
      context_length: m.context_length,
      tools: m.tools,
      reasoning: m.reasoning,
      vision: m.vision,
    }
    if (!matches(base, query)) continue
    await add(
      base,
      m.variants.filter((v) => v.platforms.includes(platform)).map(({ platforms: _p, ...v }) => v)
    )
  }
  let hubError: string | null = null
  if (o.huggingface && listed.list.huggingface.orgs.length) {
    const curated = new Set(listed.list.models.map((m) => m.repo.toLowerCase()))
    const allowed = listed.list.huggingface.backends[platform] ?? []
    try {
      const repositories = await hfLiteRtRepositories(listed.list.huggingface.orgs, query, d)
      for (const r of repositories) {
        if (curated.has(r.repo.toLowerCase())) continue
        await add(
          {
            origin: 'huggingface',
            model_id: r.repo,
            name: r.repo.split('/')[1] ?? r.repo,
            summary: '',
            license: r.license,
            gated: r.gated,
            unverified: true,
            repo: r.repo,
            revision: r.revision,
          },
          // A variant id names a folder: one conf already holds is told apart by the repository.
          uniqueHfIds(hfVariants(r.files, allowed, r.repo), r.repo, curatedIds)
        )
      }
    } catch (error) {
      hubError = error instanceof Error ? error.message : String(error)
    }
  }
  return {
    platform,
    list_source: listed.source,
    list_error: listed.error ?? null,
    huggingface: o.huggingface,
    huggingface_unavailable: hubError !== null,
    huggingface_error: hubError,
    models: rows,
  }
}
