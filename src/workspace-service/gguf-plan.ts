/**
 * The GGUF setup plan, pure: from the core's verdict for the file, its Bonsai family (when the conf
 * rules name it), the Hub's facts otherwise, the PrismML catalog and free space, what a setup
 * downloads and installs, how many bytes that is and what blocks it. `digest` hashes what decides
 * the work, so `models.install` runs exactly the plan that was reviewed.
 */
import { createHash } from 'node:crypto'
import type {
  BackendCatalogResponse,
  ModelCompatibilityResponse,
  PrismFamily,
  PrismFamilyFile,
} from '@atomic-chat/core/contracts'
import type {
  ModelSetupArtifact,
  ModelSetupBlocker,
  ModelSetupEngine,
  ModelSetupPlan,
  ModelSetupPlanRequest,
} from '../contract/index.js'

/** The provider a file is registered for when it needs no PrismML build. */
export const STOCK_PROVIDER = 'llamacpp-upstream'

export interface GgufPlanInput {
  request: ModelSetupPlanRequest
  verdict: ModelCompatibilityResponse
  family?: { family: PrismFamily; file: PrismFamilyFile } | undefined
  /** The Hub's facts for a file no family pins. */
  hubFile?: { size: number; sha256?: string | undefined }
  /** `POST /backends/atomic-prism/catalog`, when the verdict involves PrismML. */
  prism?: BackendCatalogResponse | undefined
  freeBytes: number | null
}

/** `owner/<file name without .gguf>`: unique per file, and a leaf of the model tree. */
export function defaultModelId(repo: string, file: string): string {
  const owner = repo.split('/')[0] ?? repo
  return `${owner}/${(file.split('/').pop() ?? file).replace(/\.gguf$/i, '')}`
}

export function matchFamily(families: readonly PrismFamily[], repo: string, file: string) {
  for (const family of families) {
    if (family.repo.toLowerCase() !== repo.toLowerCase()) continue
    const match = family.files.find((f) => f.file === file)
    if (match) return { family, file: match }
  }
  return undefined
}

const buildOf = (tag: string) => Number(/^prism-b(\d+)-/.exec(tag)?.[1] ?? Number.NaN)

/**
 * The PrismML build to run on: the catalog's recommendation (already gated by this machine's
 * hardware) when it is at least `minBuild`, else the newest that is. `null` when none is.
 */
export function choosePrismBuild(
  catalog: BackendCatalogResponse,
  minBuild?: number
): ModelSetupEngine | null {
  const fits = catalog.available.filter((b) => minBuild === undefined || buildOf(b.version) >= minBuild)
  const pick = fits.find((b) => `${b.version}/${b.backend}` === catalog.recommended) ?? fits[0]
  if (!pick) return null
  const installed = catalog.installed.some((b) => b.version === pick.version && b.backend === pick.backend)
  const size =
    catalog.releases?.find((r) => r.tag === pick.version)?.variants.find((v) => v.id === pick.backend)
      ?.size ?? 0
  return {
    provider: 'atomic-prism',
    version: pick.version,
    backend: pick.backend,
    installed,
    download_size: installed ? 0 : size,
  }
}

function engineOf(input: GgufPlanInput, blockers: ModelSetupBlocker[]): ModelSetupEngine | null {
  const { verdict, prism } = input
  if (verdict.provider !== 'atomic-prism') return null
  if (verdict.outcome === 'compatible') {
    const [version, backend] = (prism?.recommended_installed ?? '').split('/')
    return version && backend
      ? { provider: 'atomic-prism', version, backend, installed: true, download_size: 0 }
      : null
  }
  if (verdict.outcome !== 'engine_required' && verdict.outcome !== 'engine_update_required') return null
  const build = prism ? choosePrismBuild(prism, verdict.min_prism_build) : null
  if (!build)
    blockers.push({
      code: 'no_engine_build',
      message: 'No approved PrismML llama.cpp build runs this model on this computer yet.',
    })
  return build
}

function artifactsOf(input: GgufPlanInput) {
  const { request, family } = input
  if (!family) {
    const model: ModelSetupArtifact = {
      repo: request.repo,
      file: request.file,
      revision: request.revision ?? 'main',
      ...(input.hubFile?.sha256 ? { sha256: input.hubFile.sha256 } : {}),
      size: input.hubFile?.size ?? 0,
    }
    return { model, projector: null }
  }
  const { repo, revision, projectors } = family.family
  const projector = request.include_projector === false ? undefined : projectors.find((p) => p.default)
  return {
    model: { repo, file: family.file.file, revision, sha256: family.file.sha256, size: family.file.size },
    projector: projector
      ? { repo, file: projector.file, revision, sha256: projector.sha256, size: projector.size }
      : null,
  }
}

export function planGgufSetup(input: GgufPlanInput): ModelSetupPlan {
  const { verdict } = input
  const blockers: ModelSetupBlocker[] = []
  if (verdict.outcome === 'unsupported') blockers.push({ code: 'unsupported', message: verdict.reason })
  if (verdict.outcome === 'legacy_artifact')
    blockers.push({
      code: 'legacy_artifact',
      message: verdict.reason,
      ...(verdict.replacement ? { replacement: verdict.replacement } : {}),
    })
  const engine = engineOf(input, blockers)
  const { model, projector } = artifactsOf(input)
  const total = (engine?.download_size ?? 0) + model.size + (projector?.size ?? 0)
  if (input.freeBytes !== null && total > input.freeBytes)
    blockers.push({
      code: 'insufficient_disk_space',
      message: `The setup needs ${total} bytes and ${input.freeBytes} are free.`,
    })
  const body = {
    model_id: input.request.model_id ?? defaultModelId(model.repo, model.file),
    provider: verdict.provider ?? STOCK_PROVIDER,
    verdict,
    engine,
    model,
    projector,
    total_download_bytes: total,
    free_bytes: input.freeBytes,
    blockers,
  }
  const decides = {
    model_id: body.model_id,
    provider: body.provider,
    outcome: verdict.outcome,
    engine: engine && { version: engine.version, backend: engine.backend, installed: engine.installed },
    model,
    projector,
    blockers: blockers.map((b) => b.code),
  }
  return { digest: createHash('sha256').update(JSON.stringify(decides)).digest('hex'), ...body }
}
