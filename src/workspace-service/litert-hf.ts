/**
 * LiteRT-LM models from Hugging Face (spec `litert-lm-models`, "Модели с Hugging Face дополняют
 * курированный список"): the repositories of conf's organisations tagged `litert-lm`, each read at the
 * commit its listing names, and its `.litertlm` files turned into variants by name — `-gpu`/`_gpu` a GPU
 * file, `_intel_LNL`/`_intel_PTL` an NPU file for that generation, a file without a suffix the CPU's (and
 * the GPU's too when the repository has no GPU file). Web files, other chips' files (`_sm<n>`, `_mt<n>`,
 * `_Google_Tensor_*`, …) and `.task` files are never offered, nor a backend conf does not allow on this
 * platform. Sizes and sha256 are the tree's LFS metadata, so a download is checked like a curated one.
 */

import type { LiteRtLmBackendId, LiteRtLmNpu } from '@atomic-chat/core/contracts'

export type LiteRtFileClass =
  | { kind: 'plain'; stem: string }
  | { kind: 'variant'; stem: string; backend: LiteRtLmBackendId; npu?: LiteRtLmNpu }

const SUFFIXES: ReadonlyArray<
  [RegExp, Omit<Extract<LiteRtFileClass, { kind: 'variant' }>, 'kind' | 'stem'>]
> = [
  [/[-_]gpu$/i, { backend: 'gpu' }],
  [/_intel_lnl$/i, { backend: 'npu', npu: 'intel-lnl' }],
  [/_intel_ptl$/i, { backend: 'npu', npu: 'intel-ptl' }],
]
/** A file for the browser or for another chip than the ones LiteRT-LM's desktop library runs on. */
const NOT_OFFERED =
  /[-_](web|sm\d+|mt\d+|google_tensor\w*|tensor_g\d+|qualcomm\w*|qnn\w*|mediatek\w*|samsung\w*|exynos\w*|intel_\w+)$/i

/** What one file of a repository is, by its name; `null` for a file never offered. */
export function classifyLiteRtFile(path: string): LiteRtFileClass | null {
  const name = path.split('/').at(-1) ?? ''
  if (!name.endsWith('.litertlm')) return null
  const base = name.slice(0, -'.litertlm'.length)
  for (const [suffix, variant] of SUFFIXES) {
    const match = suffix.exec(base)
    // Another chip's file may end in `_gpu` too (`_mt6993_gpu`): its stem still names that chip.
    if (match)
      return NOT_OFFERED.test(base.slice(0, match.index))
        ? null
        : { kind: 'variant', stem: base.slice(0, match.index), ...variant }
  }
  if (NOT_OFFERED.test(base)) return null
  return { kind: 'plain', stem: base }
}

export interface HfFile {
  path: string
  size: number
  /** The LFS sha256; `null` for a file the Hub keeps outside LFS (never a model). */
  sha256: string | null
}

export interface HfVariant {
  id: string
  backend: LiteRtLmBackendId
  npu?: LiteRtLmNpu
  file: { path: string; size: number; sha256: string }
}

const ORDER: Record<LiteRtLmBackendId, number> = { npu: 0, gpu: 1, cpu: 2 }
const slug = (stem: string) =>
  stem
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')

/** A repository's files as variants, NPU first, then GPU, then CPU; only the backends in `allowed`. */
export function hfVariants(files: readonly HfFile[], allowed: readonly LiteRtLmBackendId[]): HfVariant[] {
  const classified = files.flatMap((f) => {
    const c = f.sha256 ? classifyLiteRtFile(f.path) : null
    return c ? [{ file: { path: f.path, size: f.size, sha256: f.sha256! }, c }] : []
  })
  const hasGpuFile = classified.some(({ c }) => c.kind === 'variant' && c.backend === 'gpu')
  const variants: HfVariant[] = []
  const add = (stem: string, backend: LiteRtLmBackendId, file: HfVariant['file'], npu?: LiteRtLmNpu) => {
    if (!allowed.includes(backend)) return
    const id = `${slug(stem)}-${backend}${npu ? `-${npu}` : ''}`
    if (!variants.some((v) => v.id === id)) variants.push({ id, backend, ...(npu ? { npu } : {}), file })
  }
  for (const { file, c } of classified)
    if (c.kind === 'variant') add(c.stem, c.backend, file, c.npu)
    else {
      add(c.stem, 'cpu', file)
      if (!hasGpuFile) add(c.stem, 'gpu', file)
    }
  return variants.sort((a, b) => ORDER[a.backend] - ORDER[b.backend])
}

/**
 * `variants` with ids no other model holds: a taken id is named by its repository (`<name>-<id>`), so
 * the id a search shows does not depend on which models that search found before it.
 */
export function uniqueHfIds(
  variants: readonly HfVariant[],
  repo: string,
  taken: ReadonlySet<string>
): HfVariant[] {
  const name = slug(repo.split('/').at(-1) ?? repo)
  return variants.map((v) => (taken.has(v.id) ? { ...v, id: `${name}-${v.id}` } : v))
}

export interface HfRepository {
  repo: string
  /** The commit the listing named; every file is downloaded from it. */
  revision: string
  gated: boolean
  license: string | null
  files: HfFile[]
}

export interface HfListingOptions {
  hub: string
  fetch: typeof fetch
  /** `HF_TOKEN`: sent to the Hub only. */
  token?: string | undefined
}

const PAGE = 50
const CONCURRENCY = 8

async function hubJson(url: string, o: HfListingOptions): Promise<unknown> {
  const response = await o.fetch(url, {
    headers: { Accept: 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Hugging Face answered ${response.status} for ${url}`)
  return response.json()
}

type Revision = {
  sha?: unknown
  gated?: unknown
  cardData?: { license?: unknown }
  tags?: unknown
  siblings?: Array<{ rfilename?: unknown; size?: unknown; lfs?: { sha256?: unknown; size?: unknown } }>
}

/** One repository at the commit `main` names; `null` when the Hub does not answer for it. */
async function readRepository(repo: string, o: HfListingOptions): Promise<HfRepository | null> {
  const r = (await hubJson(
    `${o.hub}/api/models/${repo}/revision/main?blobs=true&files_metadata=true`,
    o
  ).catch(() => null)) as Revision | null
  if (!r || typeof r.sha !== 'string') return null
  const tag = Array.isArray(r.tags)
    ? r.tags.find((t): t is string => typeof t === 'string' && t.startsWith('license:'))
    : undefined
  const license = typeof r.cardData?.license === 'string' ? r.cardData.license : (tag?.slice(8) ?? null)
  return {
    repo,
    revision: r.sha,
    gated: r.gated !== undefined && r.gated !== false,
    license,
    files: (r.siblings ?? []).flatMap((s) =>
      typeof s.rfilename === 'string'
        ? [
            {
              path: s.rfilename,
              size: Number(s.lfs?.size ?? s.size ?? 0),
              sha256: typeof s.lfs?.sha256 === 'string' ? s.lfs.sha256 : null,
            },
          ]
        : []
    ),
  }
}

/** The tagged repositories of `orgs` matching `query`, each read at its commit; throws when the Hub is down. */
export async function hfLiteRtRepositories(
  orgs: readonly string[],
  query: string,
  o: HfListingOptions
): Promise<HfRepository[]> {
  const ids: string[] = []
  for (const org of orgs) {
    const params = new URLSearchParams({ author: org, filter: 'litert-lm', limit: String(PAGE) })
    if (query.trim()) params.set('search', query.trim())
    const listing = await hubJson(`${o.hub}/api/models?${params}`, o)
    if (!Array.isArray(listing)) throw new Error('Hugging Face answered its model listing in another shape.')
    for (const m of listing as Array<{ id?: unknown }>)
      if (typeof m.id === 'string' && !ids.includes(m.id)) ids.push(m.id)
  }
  const repositories: HfRepository[] = []
  for (let start = 0; start < ids.length; start += CONCURRENCY)
    for (const r of await Promise.all(
      ids.slice(start, start + CONCURRENCY).map((id) => readRepository(id, o))
    ))
      if (r) repositories.push(r)
  return repositories
}
