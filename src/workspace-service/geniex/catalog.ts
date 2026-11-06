import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type {
  GeniexAccelerators,
  GeniexCheckResult,
  GeniexDevice,
  ModelYmlGeniex,
} from '@atomic-chat/core/contracts'
import type { WorkspaceServiceOptions } from '../service-options.js'
import { AtcError } from '../../errors/index.js'
import { searchHub } from '../../terminal-setup/index.js'
import { geniexList, type GeniexModel, type GeniexHubFile } from './list.js'
import { hfGgufFiles, type HfSibling } from './hf-files.js'
import { resolveUrl, HF_HUB } from '../models/hf-revision.js'

import { qualcommSearch } from './qualcomm.js'

const qualcommClients = new WeakMap<typeof fetch, ReturnType<typeof qualcommSearch>>()
type SourceFile = { size: number; sha256?: string; crc64?: string; url: string; name: string }
export interface GenieVariant {
  id: string
  backend: GeniexDevice
  verdict: GeniexCheckResult
  size_bytes: number
  record: ModelYmlGeniex
  files: SourceFile[]
  min_runtime_version?: string
}
type Candidate = { model: GeniexModel; origin: 'curated' | 'huggingface' | 'qualcomm' }
const validRepo = (repo: string) => /^[\w-][\w.-]*\/[\w-][\w.-]*$/.test(repo)
async function hfCandidate(
  repo: string,
  devices: GeniexDevice[],
  quants: string[],
  request: typeof fetch
): Promise<Candidate | null> {
  if (!validRepo(repo) || !devices.length) return null
  const response = await request(`${HF_HUB}/api/models/${repo}/revision/main?blobs=true`, {
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error(`Hugging Face returned HTTP ${response.status}`)
  const tree = (await response.json()) as {
    sha: string
    siblings: HfSibling[]
    gated?: unknown
    cardData?: { license?: string }
  }
  if (!/^[a-f0-9]{40}$/.test(tree.sha) || !Array.isArray(tree.siblings)) return null
  const pick = hfGgufFiles(
    tree.siblings.filter(
      (s) =>
        /^[\w.-]+(?:\/[\w.-]+)*$/.test(s.rfilename) &&
        !s.rfilename.split('/').some((p) => p === '..' || p === '.')
    ),
    quants
  )
  if (!pick) return null
  return {
    origin: 'huggingface',
    model: {
      id: repo,
      name: repo,
      kind: 'gguf',
      task: 'chat',
      license: tree.cardData?.license ?? '',
      description: 'Hugging Face · not verified by Atomic Chat',
      context_length: 4096,
      tools: false,
      reasoning: false,
      vision: !!pick.mmproj,
      gguf: {
        repo,
        revision: tree.sha,
        gated: !!tree.gated,
        file: pick.file,
        ...(pick.mmproj ? { mmproj: pick.mmproj } : {}),
        devices,
        platforms: ['win-arm64'],
      },
    },
  }
}

export async function genieCatalog(o: WorkspaceServiceOptions, query: string, includeHub: boolean) {
  const registered = await o.link.request<{ engines: { engine: string }[] }>('POST', '/engines/versions', {})
  if (!registered.engines.some((e) => e.engine === 'geniex'))
    throw new AtcError('ATC_USAGE', 'GenieX requires Windows arm64 with Snapdragon X.')
  const request = o.fetch ?? fetch
  const [listed, hardware] = await Promise.all([
    geniexList({
      cachePath: join(o.paths.cacheDir, 'geniex-models.json'),
      url: o.env?.['ATC_GENIEX_MODELS_URL'],
      catalogUrl: o.env?.['ATC_MODEL_CATALOG_URL'],
      fetch: request,
    }),
    o.link.request<GeniexAccelerators>('GET', '/runtimes/geniex/accelerators'),
  ])
  const curated = listed.list.models
  const candidates: Candidate[] = curated
    .filter(
      (m) =>
        (m.id + ' ' + m.name + ' ' + m.description).toLowerCase().includes(query.toLowerCase()) ||
        (m.kind === 'qairt' && m.variants.some((v) => v.id === query))
    )
    .map((model) => ({ model, origin: 'curated' }))
  let qualcommError: string | null = null
  const qualcomm = async () => {
    if (!includeHub || !hardware.chip) return []
    let search = qualcommClients.get(request)
    if (!search) {
      search = qualcommSearch(request)
      qualcommClients.set(request, search)
    }
    const excluded = new Set(
      curated.flatMap((m) => (m.kind === 'qairt' ? m.variants.map((v) => v.bundle.url) : []))
    )
    const result = await search(query, hardware.chip, excluded)
    if (result.unavailable) qualcommError = 'Some Qualcomm AI Hub results could not be loaded.'
    return result.models
  }
  const external = qualcomm()
  let hubError: string | null = null
  if (includeHub && !query.startsWith('qai-')) {
    const existing = new Set(curated.flatMap((m) => (m.kind === 'gguf' ? [m.gguf.repo.toLowerCase()] : [])))
    try {
      const repos = validRepo(query) ? [query] : (await searchHub(query, request)).map((r) => r.id)
      const selected = repos.filter((repo) => !existing.has(repo.toLowerCase())).slice(0, 50)
      for (let i = 0; i < selected.length; i += 8) {
        const results = await Promise.allSettled(
          selected
            .slice(i, i + 8)
            .map((repo) =>
              hfCandidate(
                repo,
                listed.list.huggingface.backends['win-arm64'] ?? [],
                listed.list.huggingface.quantizations,
                request
              )
            )
        )
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) candidates.push(result.value)
          else if (result.status === 'rejected') hubError = String(result.reason)
        }
      }
    } catch (error) {
      hubError = String(error)
    }
  }
  for (const m of await external) {
    candidates.push({
      origin: 'qualcomm',
      model: {
        ...m,
        kind: 'qairt',
        description: 'Qualcomm AI Hub',
        task: 'chat',
        license: '',
        context_length: 4096,
        tools: false,
        reasoning: false,
        vision: false,
      },
    })
  }
  const checks = new Map<string, Promise<GeniexCheckResult>>()
  async function variant(record: ModelYmlGeniex, files: SourceFile[], min?: string): Promise<GenieVariant> {
    const body = {
      plugin: record.plugin,
      device: record.backend,
      ...(record.chip ? { chip: record.chip } : {}),
      ...(min ? { min_runtime_version: min } : {}),
    }
    const key = JSON.stringify(body)
    if (!checks.has(key)) checks.set(key, o.link.request('POST', '/models/geniex/check', body))
    return {
      id: record.plugin === 'qairt' ? record.variant_id : record.backend,
      backend: record.backend,
      record,
      files,
      verdict: await checks.get(key)!,
      size_bytes: files.reduce((n, f) => n + f.size, 0),
      ...(min ? { min_runtime_version: min } : {}),
    }
  }
  const models = []
  for (const { model: m, origin } of candidates) {
    const common = {
      model_id: m.id,
      context_length: m.context_length,
      tools: m.tools,
      reasoning: m.reasoning,
      vision: m.vision,
      // Core 0.21.4 groups vendor QAIRT bundles under "curated". The row and pinned URL retain the publisher.
      source: origin === 'qualcomm' ? ('curated' as const) : origin,
    }
    let variants: GenieVariant[]
    if (m.kind === 'gguf') {
      const g = m.gguf
      const file = (f: GeniexHubFile) => ({
        name: f.path.split('/').at(-1)!,
        size: f.size,
        sha256: f.sha256,
        url: resolveUrl(g.repo, g.revision, f.path),
      })
      const main = file(g.file),
        projector = g.mmproj ? file(g.mmproj) : undefined
      const files = projector ? [main, projector] : [main]
      const installedId =
        origin === 'curated'
          ? m.id
          : `hf-${createHash('sha256').update(g.repo.toLowerCase()).digest('hex').slice(0, 16)}-${g.repo.split('/')[1]?.slice(0, 65)}`.toLowerCase()
      variants = await Promise.all(
        g.devices.map((backend) =>
          variant(
            {
              ...common,
              variant_id: installedId,
              plugin: 'llama_cpp',
              backend,
              repo: g.repo,
              revision: g.revision,
              file: main.name,
              ...(projector ? { mmproj: projector.name } : {}),
            },
            files
          )
        )
      )
    } else {
      variants = await Promise.all(
        m.variants
          .filter((v) => v.chip === hardware.chip)
          .map((v) =>
            variant(
              {
                ...common,
                variant_id: v.id,
                plugin: 'qairt',
                backend: 'npu',
                chip: v.chip,
                precision: v.precision,
                bundle_url: v.bundle.url,
              },
              [{ ...v.bundle, name: 'bundle.zip' }],
              v.min_runtime_version
            )
          )
      )
    }
    if (!variants.length) continue
    const preferred = ['npu', 'gpu', 'cpu', 'hybrid']
      .map((d) => variants.find((v) => v.backend === d && v.verdict.verdict === 'ok'))
      .find(Boolean)
    models.push({
      model_id: m.id,
      name: m.name,
      summary: m.description,
      license: m.license,
      origin,
      unverified: origin === 'huggingface',
      gated: m.kind === 'gguf' && m.gguf.gated,
      variants,
      default_variant: preferred?.id ?? null,
    })
  }
  return {
    models,
    list_source: listed.source,
    list_error: listed.error ?? null,
    huggingface_error: hubError,
    qualcomm_error: qualcommError,
  }
}
