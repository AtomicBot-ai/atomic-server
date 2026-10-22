/**
 * LiteRT-LM's curated model list — `atomic-chat-conf/models/litert-lm-models.json` (spec
 * `litert-lm-models`, "Курированный список моделей публикуется в conf"): the models Atomic Chat checked
 * (each variant's `.litertlm` file with its size and sha256, pinned to a commit) and the rules for the
 * Hugging Face models shown after them (the organisations, and the backends each platform may offer).
 * Parsing is strict by field and soft by entry: a variant with a backend, NPU target or platform this
 * client does not know is hidden, and a model left with none; a newer `schema_version` is refused whole.
 * Fetched and cached as every conf list is (`conf-list.ts`); `ATC_LITERT_LM_MODELS_URL` names another.
 */

import { LITERT_LM_BACKENDS, LITERT_LM_NPUS } from '@atomic-chat/core/contracts'
import type { LiteRtLmBackendId, LiteRtLmNpu } from '@atomic-chat/core/contracts'
import { CACHE_TTL_MS, fetchConfList } from './conf-list.js'
import type { ConfListOptions, ConfListResult } from './conf-list.js'

export { CACHE_TTL_MS }
export const DEFAULT_LITERT_LM_MODELS_URL =
  'https://raw.githubusercontent.com/AtomicBot-ai/atomic-chat-conf/main/models/litert-lm-models.json'
export const SUPPORTED_SCHEMA_VERSION = 1

/** The platforms the library ships for, as conf names them. */
export const LITERT_LM_PLATFORMS = ['macos-arm64', 'linux-x64', 'linux-arm64', 'win-x64'] as const
export type LiteRtLmPlatform = (typeof LITERT_LM_PLATFORMS)[number]

export interface LiteRtLmFile {
  /** Path inside the repository; the file keeps its name inside the variant folder. */
  path: string
  size: number
  sha256: string
}

export interface LiteRtLmVariant {
  id: string
  backend: LiteRtLmBackendId
  /** Present exactly when `backend` is `npu`. */
  npu?: LiteRtLmNpu
  platforms: LiteRtLmPlatform[]
  min_runtime_version?: string
  file: LiteRtLmFile
}

export interface LiteRtLmModel {
  id: string
  name: string
  description: string
  task: 'chat'
  license: string
  repo: string
  revision: string
  gated: boolean
  context_length: number
  tools: boolean
  reasoning: boolean
  vision: boolean
  variants: LiteRtLmVariant[]
}

export interface LiteRtLmList {
  schema_version: number
  updated_at: string
  huggingface: {
    orgs: string[]
    /** Platform → the backends a Hugging Face model may be offered for there; absent: none. */
    backends: Partial<Record<LiteRtLmPlatform, LiteRtLmBackendId[]>>
  }
  models: LiteRtLmModel[]
}

/** conf's first release of the list, for a first launch that cannot reach conf. */
const BASELINE_LIST = {
  schema_version: 1,
  updated_at: '2026-10-21T00:00:00Z',
  huggingface: {
    orgs: ['litert-community'],
    filter: 'litert-lm',
    backends: {
      'macos-arm64': ['cpu', 'gpu'],
      'linux-x64': ['cpu'],
      'linux-arm64': ['cpu'],
      'win-x64': ['cpu'],
    },
  },
  models: [],
}

// ── Parsing ──────────────────────────────────────────────────────────────────

const ID = /^[a-z0-9][a-z0-9._-]*$/
const FILE = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*\.litertlm$/
const SHA256 = /^[0-9a-f]{64}$/
const COMMIT = /^[0-9a-f]{40}$/
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const ORG = /^[A-Za-z0-9_.-]+$/
const VERSION = /^\d+\.\d+(\.\d+)?$/

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const isPositiveInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0
const isBackend = (value: unknown): value is LiteRtLmBackendId =>
  LITERT_LM_BACKENDS.includes(value as LiteRtLmBackendId)
const isPlatform = (value: unknown): value is LiteRtLmPlatform =>
  LITERT_LM_PLATFORMS.includes(value as LiteRtLmPlatform)
const isSafeFile = (value: unknown): value is string =>
  typeof value === 'string' && FILE.test(value) && !value.split('/').some((s) => s === '.' || s === '..')

function parseFile(raw: unknown): LiteRtLmFile | null {
  if (!isObject(raw)) return null
  const { path, size, sha256 } = raw
  if (!isSafeFile(path) || !isPositiveInt(size) || typeof sha256 !== 'string' || !SHA256.test(sha256))
    return null
  return { path, size, sha256 }
}

function parseVariant(raw: unknown): LiteRtLmVariant | null {
  if (!isObject(raw)) return null
  const { id, backend, npu, platforms, min_runtime_version } = raw
  if (typeof id !== 'string' || !ID.test(id) || !isBackend(backend)) return null
  // An NPU file is compiled for one generation: without a known target it runs nowhere this client knows.
  if (backend === 'npu' ? !LITERT_LM_NPUS.includes(npu as LiteRtLmNpu) : npu !== undefined) return null
  const known = Array.isArray(platforms) ? [...new Set(platforms.filter(isPlatform))] : []
  if (known.length === 0) return null
  const file = parseFile(raw.file)
  if (!file) return null
  return {
    id,
    backend,
    ...(backend === 'npu' ? { npu: npu as LiteRtLmNpu } : {}),
    platforms: known,
    ...(typeof min_runtime_version === 'string' && VERSION.test(min_runtime_version)
      ? { min_runtime_version }
      : {}),
    file,
  }
}

function parseModel(raw: unknown): LiteRtLmModel | null {
  if (!isObject(raw)) return null
  const { id, name, description, task, license, repo, revision, gated, context_length } = raw
  const { tools, reasoning, vision, variants } = raw
  if (typeof id !== 'string' || !ID.test(id)) return null
  if (!isString(name) || !isString(description) || task !== 'chat' || !isString(license)) return null
  if (typeof repo !== 'string' || !REPO.test(repo) || typeof revision !== 'string' || !COMMIT.test(revision))
    return null
  if (typeof gated !== 'boolean' || !isPositiveInt(context_length)) return null
  if (typeof tools !== 'boolean' || typeof reasoning !== 'boolean' || typeof vision !== 'boolean') return null
  if (!Array.isArray(variants)) return null
  const parsed = variants.map(parseVariant).filter((v): v is LiteRtLmVariant => v !== null)
  if (parsed.length === 0) return null
  return {
    ...{ id, name, description, task, license, repo, revision, gated, context_length },
    ...{ tools, reasoning, vision, variants: parsed },
  }
}

/** The Hugging Face rules this client can use; unusable ones mean no Hugging Face models, not no list. */
function parseHuggingFace(raw: unknown): LiteRtLmList['huggingface'] {
  if (!isObject(raw) || raw['filter'] !== 'litert-lm') return { orgs: [], backends: {} }
  const orgs = Array.isArray(raw['orgs'])
    ? raw['orgs'].filter((o): o is string => typeof o === 'string' && ORG.test(o))
    : []
  const backends: LiteRtLmList['huggingface']['backends'] = {}
  if (isObject(raw['backends']))
    for (const [platform, list] of Object.entries(raw['backends']))
      if (isPlatform(platform) && Array.isArray(list))
        backends[platform] = [...new Set(list.filter(isBackend))]
  return { orgs, backends }
}

/** The list as this client can use it. Throws only when the document as a whole cannot be used. */
export function parseLiteRtLmList(raw: unknown): LiteRtLmList {
  if (!isObject(raw)) throw new Error('The LiteRT-LM model list is not an object.')
  const { schema_version, updated_at, models } = raw
  if (!isPositiveInt(schema_version)) throw new Error('The LiteRT-LM model list has no schema_version.')
  if (schema_version > SUPPORTED_SCHEMA_VERSION)
    throw new Error(
      `The LiteRT-LM model list has schema_version ${schema_version}; this atc reads ${SUPPORTED_SCHEMA_VERSION}.`
    )
  if (!Array.isArray(models)) throw new Error('The LiteRT-LM model list has no models array.')
  return {
    schema_version,
    updated_at: typeof updated_at === 'string' ? updated_at : '',
    huggingface: parseHuggingFace(raw['huggingface']),
    models: models.map(parseModel).filter((m): m is LiteRtLmModel => m !== null),
  }
}

export type LiteRtLmListResult = ConfListResult<LiteRtLmList>

export function fetchLiteRtLmList(o: ConfListOptions): Promise<LiteRtLmListResult> {
  return fetchConfList(
    {
      label: 'LiteRT-LM model list',
      defaultUrl: DEFAULT_LITERT_LM_MODELS_URL,
      parse: parseLiteRtLmList,
      baseline: BASELINE_LIST,
    },
    o
  )
}
