// The prefilter is lifted from Atomic-Chat/web-app/src/lib/managed-engine/hub-feed.ts @ 7cd5613aa; adapted: rows of `atc` (repository, section, architectures, estimate) instead of the app's catalog models.
/**
 * Finding checkpoints for a managed engine (spec `managed-models-server`, "Поиск и курированные
 * модели"): the curated models of the engine's descriptor as the core caches it, and a Hugging Face
 * search under `filter=safetensors`, narrowed by what certainly cannot run here — an architecture the
 * descriptor does not support, or weights that with the engine's overhead exceed the largest card. It
 * is not a verdict (that is `models.check`): an exact `owner/repo` is shown whatever the filter says.
 */

import type {
  CuratedModel,
  EnvironmentSnapshot,
  GpuFacts,
  RequirementPlan,
  RuntimeDescriptorSummary,
} from '@atomic-chat/core/contracts'
import type { CoreLink } from '../core-link/index.js'
import { AtcError } from '../errors/index.js'
import { descriptorHint, runtimeTarget } from './managed-engines.js'
import type { ManagedModelDeps } from './managed-models.js'
import { hubOf } from './managed-models.js'
import { segment } from './validation.js'

/** Bytes per parameter by safetensors dtype; packed 4-bit containers count at half a byte. */
const DTYPE_BYTES: Record<string, number> = {
  F64: 8,
  I64: 8,
  U64: 8,
  F32: 4,
  I32: 0.5,
  U32: 0.5,
  BF16: 2,
  F16: 2,
  I16: 2,
  U16: 2,
  I8: 1,
  U8: 1,
  BOOL: 1,
}
const bytesOf = (dtype: string) => (dtype.startsWith('F8_') ? 1 : (DTYPE_BYTES[dtype] ?? 1))

/** Σ parameters × bytes per dtype; null when the listing carries no parameters. Only ever low. */
export function estimateWeightBytes(parameters: Record<string, number> | undefined): number | null {
  const entries = Object.entries(parameters ?? {})
  if (entries.length === 0) return null
  return entries.reduce((total, [dtype, count]) => total + count * bytesOf(dtype), 0)
}

/** What each engine holds beyond the weights on any card, the low end the core's check counts too. */
const ENGINE_OVERHEAD_BYTES: Readonly<Record<string, number>> = {
  'tensorrt-llm': 1.5 * 1024 ** 3,
  'vllm': 2 * 1024 ** 3,
  'sglang': 2 * 1024 ** 3,
}

export interface ManagedSearchRow {
  repository: string
  /** `curated` — the descriptor's; `exact` — typed as owner/repo, unfiltered; `feed` — Hub search. */
  section: 'curated' | 'exact' | 'feed'
  architectures: string[]
  weight_bytes_estimate: number | null
  curated?: CuratedModel
  downloads?: number
}

async function environmentOf(link: CoreLink): Promise<EnvironmentSnapshot | undefined> {
  return ((await link.environments.list()) as EnvironmentSnapshot[])[0]
}

/** The descriptor the engine runs, else the one its plan would install; refused when the core has none. */
async function descriptor(link: CoreLink, engine: string): Promise<RuntimeDescriptorSummary> {
  const environment = await environmentOf(link)
  let id: string | null = descriptorHint(environment, engine)
  if (id === engine)
    id = (
      (await link.environments.probe({
        descriptor_id: engine,
        target: runtimeTarget(engine),
      })) as RequirementPlan
    ).descriptor_id
  try {
    if (!id) throw new Error('the core names no descriptor')
    return await link.request<RuntimeDescriptorSummary>('GET', `/environments/descriptors/${segment(id)}`)
  } catch (error) {
    throw new AtcError('ATC_USAGE', `The descriptor of ${engine} is not available on this machine.`, {
      details: error instanceof Error ? error.message : String(error),
      hint: `atc engines status ${engine}`,
    })
  }
}

export async function managedCatalog(link: CoreLink, engine: string) {
  const summary = await descriptor(link, engine)
  return { engine, descriptor_id: summary.descriptor_id, models: summary.curated_models }
}

interface HubEntry {
  id?: string
  modelId?: string
  downloads?: number
  config?: { architectures?: unknown }
  safetensors?: { parameters?: unknown }
}

const EXPAND = ['config', 'safetensors', 'downloads', 'likes', 'tags']
const strings = (v: unknown) =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : []
const numbers = (v: unknown) =>
  v && typeof v === 'object' && Object.values(v).every((x) => typeof x === 'number')
    ? (v as Record<string, number>)
    : undefined

function row(entry: HubEntry, section: ManagedSearchRow['section']): ManagedSearchRow {
  return {
    repository: entry.modelId ?? entry.id ?? '',
    section,
    architectures: strings(entry.config?.architectures),
    weight_bytes_estimate: estimateWeightBytes(numbers(entry.safetensors?.parameters)),
    ...(typeof entry.downloads === 'number' ? { downloads: entry.downloads } : {}),
  }
}

function passes(
  r: ManagedSearchRow,
  engine: string,
  supported: readonly string[],
  gpus: readonly GpuFacts[]
) {
  // Without `config.json` there is nothing the engine could load.
  if (r.architectures.length === 0 || !r.architectures.some((a) => supported.includes(a))) return false
  // Shared memory reports no VRAM: the size is the core's check to make, not a guess here.
  if (r.weight_bytes_estimate === null || gpus.length === 0 || gpus.some((g) => g.total_vram_bytes === null))
    return true
  const largest = Math.max(...gpus.map((g) => g.total_vram_bytes as number))
  return r.weight_bytes_estimate + (ENGINE_OVERHEAD_BYTES[engine] ?? 0) <= largest
}

export async function managedSearch(d: ManagedModelDeps, engine: string, query: string) {
  const summary = await descriptor(d.link, engine)
  const gpus = (await environmentOf(d.link))?.gpus ?? []
  const hub = hubOf(d.env)
  const token = d.env?.['HF_TOKEN']
  const get = (url: string) => d.fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  const params = new URLSearchParams({ search: query, filter: 'safetensors', limit: '50', sort: 'downloads' })
  for (const field of EXPAND) params.append('expand[]', field)
  const q = query.trim().toLowerCase()
  const rows: ManagedSearchRow[] = summary.curated_models
    .filter((m) => m.repository.toLowerCase().includes(q))
    .map((m) => ({
      repository: m.repository,
      section: 'curated',
      architectures: [],
      weight_bytes_estimate: null,
      curated: m,
    }))
  const taken = new Set(rows.map((r) => r.repository.toLowerCase()))
  if (/^[^/\s]+\/[^/\s]+$/.test(query.trim()) && !taken.has(q)) {
    const exact = new URLSearchParams()
    for (const field of EXPAND) exact.append('expand[]', field)
    const response = await get(`${hub}/api/models/${query.trim()}?${exact}`)
    if (response.ok) {
      rows.push(row((await response.json()) as HubEntry, 'exact'))
      taken.add(q)
    }
  }
  const response = await get(`${hub}/api/models?${params}`)
  if (!response.ok) throw new Error(`Hugging Face answered ${response.status} to a search`)
  for (const entry of (await response.json()) as HubEntry[]) {
    const r = row(entry, 'feed')
    if (!r.repository || taken.has(r.repository.toLowerCase())) continue
    taken.add(r.repository.toLowerCase())
    if (passes(r, engine, summary.supported_architectures, gpus)) rows.push(r)
  }
  return { engine, descriptor_id: summary.descriptor_id, rows }
}
