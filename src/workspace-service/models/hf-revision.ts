// Lifted from Atomic-Chat/web-app/src/services/managed-models/models.ts @ 7cd5613aa; adapted: the hub's base URL and the fetch are options (tests serve Hugging Face on loopback), a refused repository is an `AtcError` naming the server's `HF_TOKEN`, and only the reading of a revision is here — the download is `managed-model-setups.ts`.
/**
 * A Hugging Face repository as a managed engine's `check` needs it (design D7), read without
 * downloading a weight: the revision pinned to its commit, so every file is read and later downloaded
 * from the same tree; `config.json`, `hf_quant_config.json` when the repository has one; every file
 * with its size and LFS sha256; and the tensor names in the weight files' safetensors headers (range
 * requests, 8 at a time), numeric segments folded to `*`.
 */

import { AtcError } from '../../errors/index.js'

export const HF_HUB = 'https://huggingface.co'

/** One file of a checkpoint as the core's `check` takes it. */
export interface CheckpointFile {
  path: string
  size: number
  sha256: string | null
}

export interface HfRevision {
  repository: string
  /** The commit the requested revision resolved to. */
  revision: string
  config_json: unknown
  hf_quant_config_json: unknown | null
  files: CheckpointFile[]
  /** Folded tensor names; absent when any header could not be read (the core then skips those checks). */
  weight_names?: string[]
}

/** The body of `POST /models/<engine>/check`. */
export interface CheckRequest {
  repository: string
  revision: string
  config_json: unknown
  hf_quant_config_json: unknown | null
  files: CheckpointFile[]
  gpu_id?: string
  weight_names?: string[]
}

export interface HubOptions {
  token?: string | undefined
  fetch: typeof fetch
  /** The hub's base URL; Hugging Face itself by default. */
  hub?: string
}

interface HfSibling {
  rfilename: string
  size?: number
  lfs?: { sha256?: string; size?: number }
}

const authorization = (token: string | undefined): Record<string, string> =>
  token ? { Authorization: `Bearer ${token}` } : {}

async function hfJson(url: string, repository: string, o: HubOptions): Promise<unknown> {
  const response = await o.fetch(url, { headers: authorization(o.token) })
  if (response.status === 401 || response.status === 403)
    throw new AtcError(
      'ATC_USAGE',
      `Hugging Face refused access to ${repository}: the server needs HF_TOKEN for a gated model.`,
      {
        details: `HTTP ${response.status}`,
        hint: `accept the model's terms on ${HF_HUB}/${repository}, then set HF_TOKEN in the server's environment and restart it`,
      }
    )
  if (!response.ok) throw new Error(`Hugging Face answered ${response.status} for ${url}`)
  return response.json()
}

/** `model.safetensors` or a standard shard (`model-00001-of-00003.safetensors`), at the repository root. */
const MODEL_SHARD = /^model(-\d+-of-\d+)?\.safetensors$/i

/** The standard shards when there are any, otherwise every root-level `.safetensors` (the core's rule). */
function weightSafetensors(files: readonly CheckpointFile[]): CheckpointFile[] {
  const root = files.filter((f) => !f.path.includes('/') && f.path.toLowerCase().endsWith('.safetensors'))
  const shards = root.filter((f) => MODEL_SHARD.test(f.path))
  return shards.length > 0 ? shards : root
}

/** Most headers fit in the first request, so a shard costs one round trip, not two. */
const HEADER_PROBE_BYTES = 256 * 1024
/** Beyond this, not a header worth reading (real ones are kilobytes to a few megabytes). */
const MAX_HEADER_BYTES = 100 * 1024 * 1024
/** Header requests in flight at once: a 47-shard checkpoint reads in a few rounds, not 47. */
const HEADER_CONCURRENCY = 8

/** `bytes=from-to` of one file, or null when the answer is not that range (`206`). */
async function rangeBytes(url: string, from: number, to: number, o: HubOptions): Promise<Uint8Array | null> {
  const response = await o.fetch(url, {
    headers: { ...authorization(o.token), Range: `bytes=${from}-${to}` },
  })
  if (response.status !== 206) {
    await response.body?.cancel().catch(() => undefined)
    return null
  }
  return new Uint8Array(await response.arrayBuffer())
}

/** The tensor names in one `.safetensors` header (8-byte little-endian length, then JSON). */
async function headerTensorNames(url: string, o: HubOptions): Promise<string[] | null> {
  const first = await rangeBytes(url, 0, HEADER_PROBE_BYTES - 1, o)
  if (first === null || first.length < 8) return null
  const length = Number(new DataView(first.buffer, first.byteOffset, 8).getBigUint64(0, true))
  if (length <= 0 || length > MAX_HEADER_BYTES) return null
  const header =
    first.length >= 8 + length ? first.subarray(8, 8 + length) : await rangeBytes(url, 8, 8 + length - 1, o)
  if (header === null || header.length !== length) return null
  const parsed: unknown = JSON.parse(new TextDecoder().decode(header))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  return Object.keys(parsed).filter((key) => key !== '__metadata__')
}

/** `model.layers.12.mlp.experts.7.w1` → `model.layers.*.mlp.experts.*.w1`. */
export function foldTensorName(name: string): string {
  return name.replace(/(?<=^|\.)\d+(?=\.|$)/g, '*')
}

/** Every weight file's tensor names, folded and sorted; undefined when any header cannot be read. */
async function readWeightNames(
  files: readonly CheckpointFile[],
  resolve: (path: string) => string,
  o: HubOptions
): Promise<string[] | undefined> {
  const weights = weightSafetensors(files)
  if (weights.length === 0) return undefined
  const names = new Set<string>()
  try {
    for (let start = 0; start < weights.length; start += HEADER_CONCURRENCY) {
      const batch = weights.slice(start, start + HEADER_CONCURRENCY)
      for (const own of await Promise.all(batch.map((f) => headerTensorNames(resolve(f.path), o)))) {
        if (own === null) return undefined
        for (const name of own) names.add(foldTensorName(name))
      }
    }
  } catch {
    return undefined
  }
  return [...names].sort()
}

/** What a person pastes: a repo id or its huggingface.co URL. */
export function normalizeRepository(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/(www\.)?huggingface\.co\//, '')
    .replace(/^huggingface\.co\//, '')
    .replace(/\/+$/, '')
}

/** The URL of one file of a pinned revision. */
export function resolveUrl(repository: string, revision: string, path: string, hub = HF_HUB): string {
  return `${hub}/${repository}/resolve/${revision}/${path.split('/').map(encodeURIComponent).join('/')}`
}

export async function fetchHfRevision(
  repository: string,
  revision: string | undefined,
  o: HubOptions
): Promise<HfRevision> {
  const hub = o.hub ?? HF_HUB
  const listing = (await hfJson(
    `${hub}/api/models/${repository}/revision/${encodeURIComponent(revision ?? 'main')}?blobs=true&files_metadata=true`,
    repository,
    o
  )) as { sha?: string; siblings?: HfSibling[] }
  if (!listing.sha) throw new Error(`Hugging Face did not name the commit of ${repository}`)
  const sha = listing.sha
  const files: CheckpointFile[] = (listing.siblings ?? []).map((s) => ({
    path: s.rfilename,
    size: s.lfs?.size ?? s.size ?? 0,
    sha256: s.lfs?.sha256 ?? null,
  }))
  const resolve = (path: string) => resolveUrl(repository, sha, path, hub)
  const weightNames = await readWeightNames(files, resolve, o)
  return {
    repository,
    revision: sha,
    config_json: await hfJson(resolve('config.json'), repository, o),
    hf_quant_config_json: files.some((f) => f.path === 'hf_quant_config.json')
      ? await hfJson(resolve('hf_quant_config.json'), repository, o)
      : null,
    files,
    ...(weightNames ? { weight_names: weightNames } : {}),
  }
}

/** The body of `POST /models/<engine>/check` for a revision read by `fetchHfRevision`. */
export function checkRequestFor(meta: HfRevision, gpuId?: string): CheckRequest {
  return {
    repository: meta.repository,
    revision: meta.revision,
    config_json: meta.config_json,
    hf_quant_config_json: meta.hf_quant_config_json,
    files: meta.files,
    ...(gpuId ? { gpu_id: gpuId } : {}),
    ...(meta.weight_names ? { weight_names: meta.weight_names } : {}),
  }
}
