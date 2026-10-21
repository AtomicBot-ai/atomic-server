// The catalog reading is lifted from Atomic-Chat/web-app/src/services/foundry-local/microsoft-catalog.ts @ 7cd5613aa, the default variant from lib/foundry-local/hub.ts; adapted: Node `fetch`, one search that joins conf's list and the catalog, the host platform from the server's own process.
/**
 * Finding Foundry Local models (spec `foundry-local-server`, "Поиск моделей Foundry Local"): conf's
 * curated list first, then the chat models of Microsoft's catalog (`POST asset-gallery`, latest label,
 * the accelerators the core runs, "Foundry Local on Devices"), grouped by parent model, each model's
 * variants for this host's platform with the core's verdict on each (`POST /models/foundry-local/check`).
 * A catalog model is unverified: its files carry no sha256. A catalog that cannot be read leaves the
 * curated list alone; a list conf cannot serve falls back to the last copy, and the result says so.
 */

import type {
  FoundryLocalCheckResult,
  FoundryLocalDevice,
  FoundryLocalExecutionProvider,
} from '@atomic-chat/core/contracts'
import type { CoreLink } from '../core-link/index.js'
import { AtcError } from '../errors/index.js'
import { fetchFoundryLocalList } from './foundry-list.js'
import type { FoundryLocalListOptions, FoundryLocalModel, FoundryLocalPlatform } from './foundry-list.js'

const EXECUTION_PROVIDERS: ReadonlyArray<[string, FoundryLocalExecutionProvider]> = [
  ['CPUExecutionProvider', 'cpu'],
  ['CUDAExecutionProvider', 'cuda'],
  ['WebGPUExecutionProvider', 'webgpu'],
  ['OpenVINOExecutionProvider', 'openvino'],
  ['QNNExecutionProvider', 'qnn'],
  ['VitisAIExecutionProvider', 'vitisai'],
]
const BY_CATALOG_NAME = new Map(EXECUTION_PROVIDERS)
/** Where a catalog variant can run, by its accelerator, as conf rules it for curated ones. */
const PLATFORMS: Record<FoundryLocalExecutionProvider, FoundryLocalPlatform[]> = {
  cpu: ['win-x64', 'win-arm64', 'macos-arm64', 'linux-x64', 'linux-arm64'],
  cuda: ['win-x64', 'linux-x64'],
  webgpu: ['win-x64', 'win-arm64', 'macos-arm64'],
  openvino: ['win-x64'],
  qnn: ['win-arm64'],
  vitisai: ['win-x64'],
}
const CHAT_TASKS = new Set(['chat-completion', 'vision-language-chat'])
const DEPLOYMENT = 'Foundry Local on Devices'
const PAGE_SIZE = 50
const MAX_PAGES = 40

export interface FoundryVariantRow {
  id: string
  device: FoundryLocalDevice
  execution_provider: FoundryLocalExecutionProvider
  asset_id: string
  version: string
  size_bytes: number | null
  context_length?: number
  files?: Array<{ path: string; size: number; sha256: string }>
  path_prefix?: string
  verdict: FoundryLocalCheckResult
}

export interface FoundryModelRow {
  origin: 'curated' | 'microsoft'
  model_id: string
  name: string
  summary: string
  license: string | null
  /** A catalog model: files without sha256, not checked by Atomic Chat. */
  unverified: boolean
  context_length?: number
  tools?: boolean
  reasoning?: boolean
  variants: FoundryVariantRow[]
  /** NPU, then GPU, then CPU among variants that run (`ok`) or will once prepared. */
  default_variant: string | null
}

type Summary = {
  assetId?: unknown
  name?: unknown
  version?: unknown
  license?: unknown
  inferenceTasks?: unknown
  deploymentOptions?: unknown
  variantInformation?: {
    parents?: Array<{ assetId?: unknown }>
    variantMetadata?: { device?: unknown; executionProvider?: unknown; fileSizeBytes?: unknown }
  } | null
}

/** This machine as conf names platforms. */
export function hostPlatform(platform: string, arch: string): FoundryLocalPlatform {
  if (platform === 'darwin') return 'macos-arm64'
  if (platform === 'win32') return arch === 'arm64' ? 'win-arm64' : 'win-x64'
  return arch === 'arm64' ? 'linux-arm64' : 'linux-x64'
}

const DEVICE_ORDER: Record<FoundryLocalDevice, number> = { npu: 0, gpu: 1, cpu: 2 }
export function defaultVariant(variants: readonly FoundryVariantRow[]): FoundryVariantRow | undefined {
  return variants
    .filter((v) => v.verdict.verdict === 'ok' || v.verdict.verdict === 'accelerator-not-prepared')
    .sort((a, b) => DEVICE_ORDER[a.device] - DEVICE_ORDER[b.device])[0]
}

async function readCatalog(url: string, request: typeof fetch): Promise<Summary[]> {
  const filters = [
    { field: 'labels', operator: 'eq', values: ['latest'] },
    {
      field: 'VariantInformation/VariantMetadata/ExecutionProvider',
      operator: 'eq',
      values: EXECUTION_PROVIDERS.map(([n]) => n),
    },
  ]
  const summaries: Summary[] = []
  let token: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ filters, pageSize: PAGE_SIZE, ...(token ? { continuationToken: token } : {}) }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new Error(`Microsoft catalog: HTTP ${response.status}`)
    const answer = (await response.json()) as { summaries?: unknown; continuationToken?: unknown }
    if (!Array.isArray(answer.summaries))
      throw new Error('The Microsoft catalog answered in a shape atc does not read.')
    summaries.push(...(answer.summaries as Summary[]))
    token =
      typeof answer.continuationToken === 'string' && answer.continuationToken
        ? answer.continuationToken
        : undefined
    if (!token || answer.summaries.length === 0) break
  }
  return summaries
}

/** The catalog's chat models, grouped by parent, without the variants conf's list already holds. */
function catalogModels(summaries: Summary[], curated: readonly FoundryLocalModel[]) {
  const curatedAssets = new Set(
    curated.flatMap((m) => m.variants.map((v) => `${v.source.asset_id}@${v.source.version}`))
  )
  const models = new Map<
    string,
    {
      id: string
      name: string
      license: string | null
      variants: Array<Omit<FoundryVariantRow, 'verdict'> & { platforms: FoundryLocalPlatform[] }>
    }
  >()
  for (const s of summaries) {
    const { assetId, name, version, license, inferenceTasks, deploymentOptions, variantInformation } = s
    if (typeof assetId !== 'string' || typeof name !== 'string' || typeof version !== 'string') continue
    if (!Array.isArray(deploymentOptions) || !deploymentOptions.includes(DEPLOYMENT)) continue
    if (!(Array.isArray(inferenceTasks) ? inferenceTasks : []).some((t) => CHAT_TASKS.has(t as string)))
      continue
    const meta = variantInformation?.variantMetadata
    const parentAsset = variantInformation?.parents?.[0]?.assetId
    const ep = BY_CATALOG_NAME.get(meta?.executionProvider as string)
    const device = meta?.device
    const parent =
      typeof parentAsset === 'string'
        ? /\/models\/([^/]+)\/versions\/[^/]+$/.exec(parentAsset)?.[1]
        : undefined
    if (!ep || (device !== 'cpu' && device !== 'gpu' && device !== 'npu') || !parent) continue
    if (curatedAssets.has(`${assetId}@${version}`)) continue
    const id = parent.toLowerCase()
    const model = models.get(id) ?? { id, name: parent, license: null, variants: [] }
    if (model.variants.some((v) => v.id === name.toLowerCase())) continue
    const size = meta?.fileSizeBytes
    model.variants.push({
      id: name.toLowerCase(),
      device,
      execution_provider: ep,
      asset_id: assetId,
      version,
      platforms: PLATFORMS[ep],
      size_bytes: typeof size === 'number' && size > 0 ? size : null,
    })
    model.license ??= typeof license === 'string' ? license : null
    models.set(id, model)
  }
  return [...models.values()]
}

export interface FoundrySearchDeps {
  link: CoreLink
  fetch: typeof fetch
  list: Omit<FoundryLocalListOptions, 'fetch'>
  platform: string
  arch: string
}

export interface FoundrySearchResult {
  platform: FoundryLocalPlatform
  list_source: 'remote' | 'cache' | 'baseline'
  list_error: string | null
  catalog_unavailable: boolean
  catalog_error: string | null
  models: FoundryModelRow[]
}

/** Every word of the query in the model's id, name or summary, case aside. */
const matches = (row: Pick<FoundryModelRow, 'model_id' | 'name' | 'summary'>, query: string) =>
  query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => `${row.model_id} ${row.name} ${row.summary}`.toLowerCase().includes(w))

export async function foundrySearch(d: FoundrySearchDeps, query = ''): Promise<FoundrySearchResult> {
  const { engines } = await d.link.request<{ engines?: Array<{ engine: string }> }>(
    'POST',
    '/engines/versions',
    {}
  )
  if (!(engines ?? []).some((e) => e.engine === 'foundry-local'))
    throw new AtcError('ATC_USAGE', 'Foundry Local is not available on this platform.')
  const platform = hostPlatform(d.platform, d.arch)
  const listed = await fetchFoundryLocalList({ ...d.list, fetch: d.fetch })
  let catalog: ReturnType<typeof catalogModels> = []
  let catalogError: string | null = null
  try {
    catalog = catalogModels(await readCatalog(listed.list.catalog.url, d.fetch), listed.list.models)
  } catch (error) {
    catalogError = error instanceof Error ? error.message : String(error)
  }
  const verdicts = new Map<string, Promise<FoundryLocalCheckResult>>()
  const verdictOf = (ep: string, device: string) => {
    const key = `${ep}/${device}`
    if (!verdicts.has(key))
      verdicts.set(
        key,
        d.link.request<FoundryLocalCheckResult>('POST', '/models/foundry-local/check', {
          execution_provider: ep,
          device,
        })
      )
    return verdicts.get(key)!
  }
  const rows: FoundryModelRow[] = []
  const add = async (
    base: Omit<FoundryModelRow, 'variants' | 'default_variant'>,
    variants: Array<Omit<FoundryVariantRow, 'verdict'> & { platforms: readonly string[] }>
  ) => {
    if (!matches(base, query)) return
    const here = variants.filter((v) => v.platforms.includes(platform))
    if (here.length === 0) return
    const withVerdicts = await Promise.all(
      here.map(async ({ platforms: _p, ...v }) => ({
        ...v,
        verdict: await verdictOf(v.execution_provider, v.device),
      }))
    )
    rows.push({ ...base, variants: withVerdicts, default_variant: defaultVariant(withVerdicts)?.id ?? null })
  }
  for (const m of listed.list.models)
    await add(
      {
        origin: 'curated',
        model_id: m.id,
        name: m.name,
        summary: m.description,
        license: m.license,
        unverified: false,
        context_length: m.context_length,
        tools: m.tools,
        reasoning: m.reasoning,
      },
      m.variants.map((v) => ({
        id: v.id,
        device: v.device,
        execution_provider: v.execution_provider,
        asset_id: v.source.asset_id,
        version: v.source.version,
        size_bytes: v.files.reduce((a, f) => a + f.size, 0),
        files: v.files,
        path_prefix: v.source.path_prefix,
        platforms: v.platforms,
        ...(v.context_length ? { context_length: v.context_length } : {}),
      }))
    )
  for (const m of catalog)
    await add(
      {
        origin: 'microsoft',
        model_id: m.id,
        name: m.name,
        summary: m.license ?? '',
        license: m.license,
        unverified: true,
      },
      m.variants
    )
  return {
    platform,
    list_source: listed.source,
    list_error: listed.error ?? null,
    catalog_unavailable: catalogError !== null,
    catalog_error: catalogError,
    models: rows,
  }
}
