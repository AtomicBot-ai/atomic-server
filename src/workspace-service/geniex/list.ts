import type { QualcommBundle } from './qualcomm.js'
// Catalog parser shared in behavior with Atomic Chat's services/geniex/curated.ts (250aa30ae).
import { GENIEX_CHIPS, GENIEX_DEVICES, type GeniexChip, type GeniexDevice } from '@atomic-chat/core/contracts'
import { projectAtomicModelCollection } from '@atomic-chat/core/client'
import { fetchConfList, type ConfListOptions } from '../models/conf-list.js'
import { unifiedCatalogBaseline } from '../models/unified-catalog.js'
const SUPPORTED_SCHEMA_VERSION = 1
export type GeniexHubFile = { path: string; size: number; sha256: string }
/** The platforms GenieX's SDK ships for, as conf names them. */
export const GENIEX_PLATFORMS = ['win-arm64'] as const
export type GeniexPlatform = (typeof GENIEX_PLATFORMS)[number]

/** Where AI Hub bundles are allowed to come from: Qualcomm's S3, like conf's schema says. */
const BUNDLE_URL = /^https:\/\/qaihub-public-assets\.s3\.us-west-2\.amazonaws\.com\/qai-hub-models\//

export type GeniexFile = GeniexHubFile

export interface GeniexGgufModel {
  kind: 'gguf'
  id: string
  name: string
  description: string
  task: 'chat'
  license: string
  context_length: number
  tools: boolean
  reasoning: boolean
  vision: boolean
  gguf: {
    /** `<org>/<name>` on Hugging Face. */
    repo: string
    /** The commit every file is downloaded from. */
    revision: string
    /** The repository asks for its terms to be accepted: downloads need the person's HF token. */
    gated: boolean
    file: GeniexFile
    /** Present exactly when `vision` is true. */
    mmproj?: GeniexFile
    /** The devices the model is offered on, in conf's order. */
    devices: GeniexDevice[]
    platforms: GeniexPlatform[]
  }
}

export interface GeniexBundleVariant {
  /** Unique across the list: names the download and the folder `<data>/geniex/models/<id>`. */
  id: string
  chip: GeniexChip
  bundle: { url: string; size: number; sha256: string } | QualcommBundle
  precision: string
  /** Oldest GenieX the bundle loads in, when conf knows it before download. */
  min_runtime_version?: string
}

export interface GeniexBundleModel {
  kind: 'qairt'
  id: string
  name: string
  description: string
  task: 'chat'
  license: string
  context_length: number
  tools: boolean
  reasoning: boolean
  vision: boolean
  variants: GeniexBundleVariant[]
}

export type GeniexModel = GeniexGgufModel | GeniexBundleModel

export interface GeniexList {
  schema_version: number
  updated_at: string
  huggingface: {
    /** The GGUF quantizations the Hub offers from a Hugging Face repository (`Q4_0`, …). */
    quantizations: string[]
    /** Platform → the devices a Hugging Face model may be offered on there; absent: none. */
    backends: Partial<Record<GeniexPlatform, GeniexDevice[]>>
  }
  models: GeniexModel[]
}

// ── Parsing ──────────────────────────────────────────────────────────────────

const ID = /^[a-z0-9][a-z0-9._-]*$/
const GGUF = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*\.gguf$/
const SHA256 = /^[0-9a-f]{64}$/
const COMMIT = /^[0-9a-f]{40}$/
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const VERSION = /^\d+\.\d+(\.\d+)?$/
const QUANTIZATION = /^[A-Za-z0-9_]+$/

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const isPositiveInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0
const isDevice = (value: unknown): value is GeniexDevice => GENIEX_DEVICES.includes(value as GeniexDevice)
const isChip = (value: unknown): value is GeniexChip => GENIEX_CHIPS.includes(value as GeniexChip)
const isPlatform = (value: unknown): value is GeniexPlatform =>
  GENIEX_PLATFORMS.includes(value as GeniexPlatform)
const isSafeGguf = (value: unknown): value is string =>
  typeof value === 'string' &&
  GGUF.test(value) &&
  !value.split('/').some((segment) => segment === '.' || segment === '..')

function parseGgufFile(raw: unknown): GeniexFile | null {
  if (!isObject(raw)) return null
  const { path, size, sha256 } = raw
  if (!isSafeGguf(path) || !isPositiveInt(size) || typeof sha256 !== 'string' || !SHA256.test(sha256)) {
    return null
  }
  return { path, size, sha256 }
}

/** The fields every model carries, whatever its kind; `null` for a malformed one. */
function parseCommon(raw: Json) {
  const { id, name, description, task, license, context_length, tools, reasoning, vision } = raw
  if (typeof id !== 'string' || !ID.test(id)) return null
  if (!isString(name) || !isString(description) || task !== 'chat' || !isString(license)) return null
  if (!isPositiveInt(context_length)) return null
  if (typeof tools !== 'boolean' || typeof reasoning !== 'boolean' || typeof vision !== 'boolean') {
    return null
  }
  return {
    id,
    name,
    description,
    task: 'chat' as const,
    license,
    context_length,
    tools,
    reasoning,
    vision,
  }
}

function parseGgufModel(raw: Json): GeniexGgufModel | null {
  const common = parseCommon(raw)
  if (!common) return null
  const { repo, revision, gated, devices, platforms } = raw
  if (typeof repo !== 'string' || !REPO.test(repo)) return null
  if (typeof revision !== 'string' || !COMMIT.test(revision)) return null
  if (typeof gated !== 'boolean') return null
  const file = parseGgufFile(raw.file)
  if (!file) return null
  const mmproj = raw.mmproj === undefined ? undefined : parseGgufFile(raw.mmproj)
  if (mmproj === null) return null
  // A vision model needs its projector: without one the file is a text model mislabelled.
  if (common.vision && !mmproj) return null
  // A device or platform this client does not know is left out; a model left with none is hidden.
  const knownDevices = Array.isArray(devices) ? [...new Set(devices.filter(isDevice))] : []
  const knownPlatforms = Array.isArray(platforms) ? [...new Set(platforms.filter(isPlatform))] : []
  if (knownDevices.length === 0 || knownPlatforms.length === 0) return null
  return {
    kind: 'gguf',
    ...common,
    gguf: {
      repo,
      revision,
      gated,
      file,
      ...(mmproj ? { mmproj } : {}),
      devices: knownDevices,
      platforms: knownPlatforms,
    },
  }
}

function parseVariant(raw: unknown): GeniexBundleVariant | null {
  if (!isObject(raw)) return null
  const { id, chip, bundle, precision, min_runtime_version } = raw
  if (typeof id !== 'string' || !ID.test(id)) return null
  // A bundle is compiled for one chip: one this client does not know runs nowhere it knows.
  if (!isChip(chip)) return null
  if (!isObject(bundle)) return null
  const { url, size, sha256 } = bundle
  if (typeof url !== 'string' || !BUNDLE_URL.test(url)) return null
  if (!isPositiveInt(size) || typeof sha256 !== 'string' || !SHA256.test(sha256)) return null
  if (!isString(precision)) return null
  return {
    id,
    chip,
    bundle: { url, size, sha256 },
    precision,
    ...(typeof min_runtime_version === 'string' && VERSION.test(min_runtime_version)
      ? { min_runtime_version }
      : {}),
  }
}

function parseBundleModel(raw: Json): GeniexBundleModel | null {
  const common = parseCommon(raw)
  if (!common) return null
  if (!Array.isArray(raw.variants)) return null
  const variants = raw.variants
    .map(parseVariant)
    .filter((variant): variant is GeniexBundleVariant => variant !== null)
  if (variants.length === 0) return null
  return { kind: 'qairt', ...common, variants }
}

function parseModel(raw: unknown): GeniexModel | null {
  if (!isObject(raw)) return null
  // A kind this client does not know is hidden, not the list (spec "Клиент пропускает то, чего не понимает").
  if (raw.kind === 'gguf') return parseGgufModel(raw)
  if (raw.kind === 'qairt') return parseBundleModel(raw)
  return null
}

/** The Hugging Face rules this client can use; unusable ones mean no Hugging Face models, not no list. */
function parseHuggingFace(raw: unknown): GeniexList['huggingface'] {
  if (!isObject(raw)) return { quantizations: [], backends: {} }
  const quantizations = Array.isArray(raw.quantizations)
    ? [
        ...new Set(
          raw.quantizations.filter((q): q is string => typeof q === 'string' && QUANTIZATION.test(q))
        ),
      ]
    : []
  const backends: GeniexList['huggingface']['backends'] = {}
  if (isObject(raw.backends)) {
    for (const [platform, list] of Object.entries(raw.backends)) {
      if (isPlatform(platform) && Array.isArray(list)) {
        backends[platform] = [...new Set(list.filter(isDevice))]
      }
    }
  }
  return { quantizations, backends }
}

/**
 * The list as this client can use it. Throws only when the document as a whole cannot be used: a
 * newer `schema_version` or no models array. Entries it does not understand are skipped.
 */
export function parseGeniexList(raw: unknown): GeniexList {
  if (!isObject(raw)) throw new Error('The GenieX model list is not an object.')
  const { schema_version, updated_at, models } = raw
  if (!isPositiveInt(schema_version)) throw new Error('The GenieX model list has no schema_version.')
  if (schema_version > SUPPORTED_SCHEMA_VERSION) {
    throw new Error(
      `The GenieX model list has schema_version ${schema_version}; this app reads ${SUPPORTED_SCHEMA_VERSION}.`
    )
  }
  if (!Array.isArray(models)) throw new Error('The GenieX model list has no models array.')
  return {
    schema_version,
    updated_at: typeof updated_at === 'string' ? updated_at : '',
    huggingface: parseHuggingFace(raw.huggingface),
    models: models.map(parseModel).filter((model): model is GeniexModel => model !== null),
  }
}

export function geniexList(options: ConfListOptions) {
  return fetchConfList(
    {
      label: 'GenieX model list',
      defaultUrl:
        'https://raw.githubusercontent.com/AtomicBot-ai/atomic-chat-conf/main/models/geniex-models.json',
      parse: parseGeniexList,
      get baseline() {
        return projectAtomicModelCollection(unifiedCatalogBaseline(), 'geniex-models')
      },
    },
    options
  )
}
