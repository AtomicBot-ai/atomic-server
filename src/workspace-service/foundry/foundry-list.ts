// Lifted from Atomic-Chat/web-app/src/services/foundry-local/curated.ts @ 7cd5613aa; adapted: the cache is a file in the data folder instead of IndexedDB, the list's URL comes from `ATC_FOUNDRY_LOCAL_MODELS_URL` (a `file://` is read from disk), and the device and execution-provider lists come from `@atomic-chat/core/contracts`.
/**
 * Foundry Local's curated model list — `atomic-chat-conf/models/foundry-local-models.json` (spec
 * `foundry-local-server`, "Поиск моделей Foundry Local"): the models Atomic Chat checked (every file
 * with its size and sha256), the resolver that turns a variant's Azure ML asset into a short-lived link,
 * and the Microsoft catalog shown after them. Fetched at most once an hour and cached on disk; when conf
 * cannot be read the last accepted copy is used, else conf's first release bundled here. Parsing is
 * strict by field and soft by entry: what this client does not know is skipped; a newer
 * `schema_version` is refused whole.
 */

import { FOUNDRY_LOCAL_DEVICES, FOUNDRY_LOCAL_EXECUTION_PROVIDERS } from '@atomic-chat/core/contracts'
import type { FoundryLocalDevice, FoundryLocalExecutionProvider } from '@atomic-chat/core/contracts'
import { CACHE_TTL_MS, fetchConfList } from '../models/conf-list.js'
import type { ConfListOptions, ConfListResult } from '../models/conf-list.js'

export const DEFAULT_FOUNDRY_LOCAL_MODELS_URL =
  'https://raw.githubusercontent.com/AtomicBot-ai/atomic-chat-conf/main/models/foundry-local-models.json'
export const SUPPORTED_SCHEMA_VERSION = 1
export { CACHE_TTL_MS }

export const FOUNDRY_LOCAL_PLATFORMS = [
  'win-x64',
  'win-arm64',
  'macos-arm64',
  'linux-x64',
  'linux-arm64',
] as const
export type FoundryLocalPlatform = (typeof FOUNDRY_LOCAL_PLATFORMS)[number]

/** Where a variant's files live: an Azure ML registry asset (the only kind this client knows). */
export interface FoundryLocalAzureMlSource {
  kind: 'azureml'
  /** `azureml://registries/<r>/models/<name>/versions/<v>`, version included. */
  asset_id: string
  version: string
  /** Folder inside the asset's container; files are `<container>/<path_prefix>/<path>`. */
  path_prefix: string
}

export interface FoundryLocalFile {
  /** Relative to `path_prefix` in the container and to the variant folder on disk. */
  path: string
  size: number
  sha256: string
}

export interface FoundryLocalVariant {
  id: string
  device: FoundryLocalDevice
  execution_provider: FoundryLocalExecutionProvider
  platforms: FoundryLocalPlatform[]
  source: FoundryLocalAzureMlSource
  files: FoundryLocalFile[]
  /** Only when smaller than the model's (NPU builds are made for 4K). */
  context_length?: number
}

export interface FoundryLocalModel {
  id: string
  name: string
  description: string
  task: 'chat'
  license: string
  context_length: number
  tools: boolean
  reasoning: boolean
  variants: FoundryLocalVariant[]
}

export interface FoundryLocalList {
  schema_version: number
  updated_at: string
  resolver: { url_template: string; regions: string[] }
  catalog: { url: string }
  models: FoundryLocalModel[]
}

/** conf's first release of the list, for a first launch that cannot reach conf. */
const BASELINE_LIST = {
  schema_version: 1,
  updated_at: '2026-10-15T00:00:00Z',
  resolver: {
    url_template:
      'https://{region}.api.azureml.ms/modelregistry/v1.0/registry/models/nonazureaccount?assetId={asset_id}',
    regions: ['eastus', 'westeurope', 'eastus2', 'westus2', 'southeastasia'],
  },
  catalog: { url: 'https://api.catalog.azureml.ms/asset-gallery/v1.0/models' },
  models: [],
}

/** An HTTPS URL, or plain HTTP on this machine's loopback (a test's Azure and catalog stand-in). */
export const servedUrl = (value: string) =>
  /^(https:\/\/|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/)/.test(value)

// ── Parsing ──────────────────────────────────────────────────────────────────

const ID = /^[a-z0-9][a-z0-9._-]*$/
const PATH = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/
const SHA256 = /^[0-9a-f]{64}$/
const ASSET_ID =
  /^azureml:\/\/registries\/[A-Za-z0-9_.-]+\/models\/[A-Za-z0-9_.-]+\/versions\/[A-Za-z0-9_.-]+$/

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const isPositiveInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0
const isSafePath = (value: unknown): value is string =>
  typeof value === 'string' &&
  PATH.test(value) &&
  !value.split('/').some((segment) => segment === '.' || segment === '..')

function parseFile(raw: unknown): FoundryLocalFile | null {
  if (!isObject(raw)) return null
  const { path, size, sha256 } = raw
  if (!isSafePath(path) || !isPositiveInt(size) || typeof sha256 !== 'string' || !SHA256.test(sha256)) {
    return null
  }
  return { path, size, sha256 }
}

function parseSource(raw: unknown): FoundryLocalAzureMlSource | null {
  if (!isObject(raw) || raw.kind !== 'azureml') return null
  const { asset_id, version, path_prefix } = raw
  if (typeof asset_id !== 'string' || !ASSET_ID.test(asset_id)) return null
  if (!isString(version) || !asset_id.endsWith(`/versions/${version}`)) return null
  if (!isSafePath(path_prefix)) return null
  return { kind: 'azureml', asset_id, version, path_prefix }
}

function parseVariant(raw: unknown, modelContext: number): FoundryLocalVariant | null {
  if (!isObject(raw)) return null
  const { id, device, execution_provider, platforms, files, context_length } = raw
  if (typeof id !== 'string' || !ID.test(id)) return null
  if (!FOUNDRY_LOCAL_DEVICES.includes(device as FoundryLocalDevice)) return null
  if (!FOUNDRY_LOCAL_EXECUTION_PROVIDERS.includes(execution_provider as FoundryLocalExecutionProvider)) {
    return null
  }
  const source = parseSource(raw.source)
  if (!source) return null
  // A platform this client does not know is left out; a variant left with none is skipped.
  const known = Array.isArray(platforms)
    ? platforms.filter((platform): platform is FoundryLocalPlatform =>
        FOUNDRY_LOCAL_PLATFORMS.includes(platform as FoundryLocalPlatform)
      )
    : []
  if (known.length === 0) return null
  if (!Array.isArray(files) || files.length === 0) return null
  const parsedFiles = files.map(parseFile)
  // One unusable file makes the variant undownloadable: never half of it.
  if (parsedFiles.some((file) => file === null)) return null
  return {
    id,
    device: device as FoundryLocalDevice,
    execution_provider: execution_provider as FoundryLocalExecutionProvider,
    platforms: [...new Set(known)],
    source,
    files: parsedFiles as FoundryLocalFile[],
    ...(isPositiveInt(context_length) && context_length < modelContext ? { context_length } : {}),
  }
}

function parseModel(raw: unknown): FoundryLocalModel | null {
  if (!isObject(raw)) return null
  const { id, name, description, task, license, context_length, tools, reasoning, variants } = raw
  if (typeof id !== 'string' || !ID.test(id)) return null
  if (!isString(name) || !isString(description) || task !== 'chat' || !isString(license)) return null
  if (!isPositiveInt(context_length) || typeof tools !== 'boolean' || typeof reasoning !== 'boolean') {
    return null
  }
  if (!Array.isArray(variants)) return null
  const parsed = variants
    .map((variant) => parseVariant(variant, context_length))
    .filter((variant): variant is FoundryLocalVariant => variant !== null)
  if (parsed.length === 0) return null
  return { id, name, description, task, license, context_length, tools, reasoning, variants: parsed }
}

/**
 * The list as this client can use it. Throws when the document as a whole cannot be used: a newer
 * `schema_version`, or a resolver or catalog it cannot reach. Entries it does not understand are
 * skipped, never fatal.
 */
export function parseFoundryLocalList(raw: unknown): FoundryLocalList {
  if (!isObject(raw)) throw new Error('The Foundry Local model list is not an object.')
  const { schema_version, updated_at, resolver, catalog, models } = raw
  if (!isPositiveInt(schema_version)) throw new Error('The Foundry Local model list has no schema_version.')
  if (schema_version > SUPPORTED_SCHEMA_VERSION) {
    throw new Error(
      `The Foundry Local model list has schema_version ${schema_version}; this app reads ${SUPPORTED_SCHEMA_VERSION}.`
    )
  }
  if (
    !isObject(resolver) ||
    typeof resolver.url_template !== 'string' ||
    !servedUrl(resolver.url_template) ||
    !resolver.url_template.includes('{region}') ||
    !resolver.url_template.includes('{asset_id}') ||
    !Array.isArray(resolver.regions) ||
    resolver.regions.length === 0 ||
    !resolver.regions.every((region) => typeof region === 'string' && /^[a-z0-9]+$/.test(region))
  ) {
    throw new Error('The Foundry Local model list has no usable resolver.')
  }
  if (!isObject(catalog) || typeof catalog.url !== 'string' || !servedUrl(catalog.url)) {
    throw new Error('The Foundry Local model list has no usable catalog URL.')
  }
  if (!Array.isArray(models)) throw new Error('The Foundry Local model list has no models array.')
  return {
    schema_version,
    updated_at: typeof updated_at === 'string' ? updated_at : '',
    resolver: { url_template: resolver.url_template, regions: resolver.regions as string[] },
    catalog: { url: catalog.url },
    models: models.map(parseModel).filter((model): model is FoundryLocalModel => model !== null),
  }
}

export type FoundryLocalListResult = ConfListResult<FoundryLocalList>
export type FoundryLocalListOptions = ConfListOptions

/** A fresh cache (unless forced), else conf (cached when it parses), else the last accepted copy, else the baseline. */
export function fetchFoundryLocalList(o: FoundryLocalListOptions): Promise<FoundryLocalListResult> {
  return fetchConfList(
    {
      label: 'Foundry Local model list',
      defaultUrl: DEFAULT_FOUNDRY_LOCAL_MODELS_URL,
      parse: parseFoundryLocalList,
      baseline: BASELINE_LIST,
    },
    o
  )
}
