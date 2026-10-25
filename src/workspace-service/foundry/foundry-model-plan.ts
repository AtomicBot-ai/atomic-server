// The resolve, the listing and model.yml are lifted from Atomic-Chat/web-app/src/services/foundry-local/install.ts @ 7cd5613aa; adapted: the variant chosen from `foundrySearch`, the Azure Blob listing read without a DOM, a plan with a digest the job installs.
/**
 * What downloading a Foundry Local variant would do (spec `foundry-local-server`, "Скачивание модели
 * Foundry Local", design D9): the variant — named, else by `--device`, else NPU, GPU, CPU among those the
 * core says run (`ok`) or will once prepared — and the core's verdict; the files of conf's list (sizes,
 * sha256), or for a catalog model the container's listing under its directory (sizes only); the room in
 * the data folder. Only an `ok` verdict downloads.
 */

import { createHash } from 'node:crypto'
import type { FoundryModelPlan } from '../../contract/index.js'
import type { CoreLink } from '../../core-link/index.js'
import { AtcError } from '../../errors/index.js'
import type { FoundrySearchDeps, FoundryVariantRow } from './foundry-catalog.js'
import { foundrySearch } from './foundry-catalog.js'
import { fetchFoundryLocalList, servedUrl } from './foundry-list.js'
import type { FoundryLocalList } from './foundry-list.js'
import type { StoreFiles } from '../managed/managed-model-plan.js'
import { underRoot } from '../managed/managed-model-plan.js'

export interface Resolved {
  container: string
  query: string
  tags: Record<string, unknown>
}

const HINTS: Record<string, string> = {
  'accelerator-not-prepared': 'atc engines accelerators foundry-local --prepare',
  'engine-not-installed': 'atc engines install foundry-local',
}

/** Ask the resolver region by region; the first answer with a container link wins. */
export async function resolveVariant(
  list: FoundryLocalList,
  assetId: string,
  request: typeof fetch
): Promise<Resolved> {
  const failures: string[] = []
  for (const region of list.resolver.regions) {
    const url = list.resolver.url_template
      .replace('{region}', region)
      .replace('{asset_id}', encodeURIComponent(assetId))
    try {
      const response = await request(url, { signal: AbortSignal.timeout(20_000) })
      if (response.status !== 200) {
        failures.push(`${region}: HTTP ${response.status}`)
        continue
      }
      const answer = (await response.json()) as { blobSasUri?: unknown; modelEntity?: { kvTags?: unknown } }
      const sas = answer.blobSasUri
      if (typeof sas !== 'string' || !servedUrl(sas) || !sas.includes('?')) {
        failures.push(`${region}: no container link in the answer`)
        continue
      }
      const [container, query] = sas.split('?', 2) as [string, string]
      const tags = answer.modelEntity?.kvTags
      return {
        container: container.replace(/\/+$/, ''),
        query,
        tags: tags && typeof tags === 'object' ? (tags as Record<string, unknown>) : {},
      }
    } catch (error) {
      failures.push(`${region}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new AtcError('ATC_USAGE', 'The Foundry Local model source is unavailable.', {
    details: failures.join('; ') || 'no region to ask',
  })
}

const SAFE_PATH = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/
const isSafePath = (path: string) =>
  SAFE_PATH.test(path) && !path.split('/').some((s) => s === '.' || s === '..')
const tag = (xml: string, name: string) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1]

/** The container's blobs under `prefix`, following the listing's markers (Azure Blob `comp=list`). */
export async function listContainer(resolved: Resolved, prefix: string, request: typeof fetch) {
  const files: Array<{ path: string; size: number }> = []
  let marker = ''
  for (let page = 0; page < 20; page++) {
    const url =
      `${resolved.container}?${resolved.query}&restype=container&comp=list` +
      (prefix ? `&prefix=${encodeURIComponent(`${prefix}/`)}` : '') +
      (marker ? `&marker=${encodeURIComponent(marker)}` : '')
    const response = await request(url, { signal: AbortSignal.timeout(20_000) })
    if (response.status !== 200)
      throw new AtcError('ATC_USAGE', `The Foundry Local file listing answered HTTP ${response.status}.`)
    const xml = (await response.text()).replace(/^\uFEFF/, '')
    for (const [, blob] of xml.matchAll(/<Blob>([\s\S]*?)<\/Blob>/g)) {
      const name = tag(blob!, 'Name') ?? ''
      const size = Number(tag(blob!, 'Content-Length'))
      if (prefix && !name.startsWith(`${prefix}/`)) continue
      const path = prefix ? name.slice(prefix.length + 1) : name
      if (isSafePath(path) && Number.isFinite(size) && size > 0) files.push({ path, size })
    }
    marker = tag(xml, 'NextMarker') ?? ''
    if (!marker) break
  }
  if (files.length === 0) throw new AtcError('ATC_USAGE', 'The Foundry Local variant lists no files.')
  return files
}

const DEVICE_ORDER: Record<string, number> = { npu: 0, gpu: 1, cpu: 2 }
const usable = (v: FoundryVariantRow) =>
  v.verdict.verdict === 'ok' || v.verdict.verdict === 'accelerator-not-prepared'
const str = (tags: Record<string, unknown>, key: string) =>
  typeof tags[key] === 'string' && tags[key] ? (tags[key] as string) : undefined

export interface FoundryPlanDeps extends FoundrySearchDeps {
  modelsDir: string
  files: StoreFiles
  link: CoreLink
}

export async function foundryModelPlan(
  d: FoundryPlanDeps,
  input: { model: string; variant?: string; device?: string }
): Promise<FoundryModelPlan> {
  const found = await foundrySearch(d)
  const named = input.variant ?? input.model
  const model = found.models.find((m) => m.model_id === input.model || m.variants.some((v) => v.id === named))
  if (!model)
    throw new AtcError(
      'ATC_USAGE',
      `No Foundry Local model or variant ${input.model} for ${found.platform}.`,
      {
        hint: 'see atc models search --engine foundry-local',
      }
    )
  const variant =
    model.variants.find((v) => v.id === named) ??
    (input.device
      ? [...model.variants]
          .filter((v) => v.device === input.device)
          .sort((a, b) => Number(usable(b)) - Number(usable(a)))[0]
      : model.variants.filter(usable).sort((a, b) => DEVICE_ORDER[a.device]! - DEVICE_ORDER[b.device]!)[0])
  if (!variant)
    throw new AtcError(
      'ATC_USAGE',
      `${model.name} has no variant${input.device ? ` for the ${input.device}` : ''} that runs here.`,
      {
        details: model.variants.map((v) => `${v.id}: ${v.verdict.verdict}`).join('; '),
        ...(model.variants.some((v) => HINTS[v.verdict.verdict])
          ? { hint: HINTS[model.variants.find((v) => HINTS[v.verdict.verdict])!.verdict.verdict] }
          : {}),
      }
    )
  const blockers: string[] = []
  if (variant.verdict.verdict !== 'ok') {
    const hint = HINTS[variant.verdict.verdict]
    blockers.push(
      `${variant.id}: ${variant.verdict.reason ?? variant.verdict.verdict}${hint ? ` (${hint})` : ''}`
    )
  }
  const { list } = await fetchFoundryLocalList({ ...d.list, fetch: d.fetch })
  const resolved = blockers.length ? undefined : await resolveVariant(list, variant.asset_id, d.fetch)
  const prefix = variant.path_prefix ?? (resolved ? str(resolved.tags, 'directoryPath') : undefined) ?? ''
  const files = variant.files ?? (resolved ? await listContainer(resolved, prefix, d.fetch) : [])
  const dir = underRoot(d.modelsDir, variant.id)
  const sizes = await Promise.all(files.map((f) => d.files.size(underRoot(dir, f.path))))
  const pending = files.filter((f, i) => sizes[i] !== f.size).map((f) => f.path)
  const download = files.filter((f) => pending.includes(f.path)).reduce((a, f) => a + f.size, 0)
  const free = await d.link.disk.available(d.modelsDir).catch(() => null)
  if (free !== null && download > free) blockers.push(`Not enough free space for ${variant.id}.`)
  const tags = resolved?.tags ?? {}
  const contextLength =
    variant.context_length ?? model.context_length ?? (Number(str(tags, 'contextLength')) || undefined)
  const start = str(tags, 'reasoningStart')
  const end = str(tags, 'reasoningEnd')
  return {
    digest: createHash('sha256')
      .update(JSON.stringify({ variant: variant.id, asset: variant.asset_id, files }))
      .digest('hex'),
    model_id: model.model_id,
    name: model.name,
    variant_id: variant.id,
    device: variant.device,
    execution_provider: variant.execution_provider,
    asset_id: variant.asset_id,
    version: variant.version,
    unverified: model.unverified,
    verdict: variant.verdict,
    dir,
    prefix,
    files,
    pending,
    download_bytes: download,
    free_bytes: free,
    record: {
      ...(contextLength ? { context_length: contextLength } : {}),
      tools: model.tools ?? str(tags, 'supportsToolCalling')?.toLowerCase() === 'true',
      reasoning: model.reasoning ?? str(tags, 'supportsReasoning')?.toLowerCase() === 'true',
      ...(start && end ? { reasoning_start: start, reasoning_end: end } : {}),
    },
    blockers,
  }
}
