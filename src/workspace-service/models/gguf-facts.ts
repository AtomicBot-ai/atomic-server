/**
 * What a GGUF setup plan is made of, gathered now: the Bonsai families and the compatibility verdict
 * from the core, the Hub's size and hash for a file no family pins, the PrismML catalog when the
 * verdict involves PrismML (asked with the file's requirements), and free space. Then `planGgufSetup` decides.
 */
import { AtomicCoreError } from '@atomic-chat/core'
import type {
  BackendCatalogRequest,
  BackendCatalogResponse,
  ModelCompatibilityResponse,
  PrismFamiliesResponse,
} from '@atomic-chat/core/contracts'
import { fetchHfGgufFiles, hfToken, ggufShardSetPaths } from '@atomic-chat/core/models'
import type { CoreLink } from '../../core-link/index.js'
import type { ModelSetupPlan, ModelSetupPlanRequest } from '../../contract/index.js'
import { AtcError } from '../../errors/index.js'
import { matchFamily, planGgufSetup } from './gguf-plan.js'
import type { GgufPlanInput } from './gguf-plan.js'

export interface GgufFactsDeps {
  link: CoreLink
  fetch: typeof fetch
  env: NodeJS.ProcessEnv
}

export function planRequest(raw: Record<string, unknown>): ModelSetupPlanRequest {
  const text = (v: unknown) => typeof v === 'string' && v.trim() !== ''
  if (!text(raw['repo']) || !text(raw['file']))
    throw new AtcError('ATC_USAGE', 'A model setup needs the Hugging Face repo and file.')
  if (!/\.gguf$/i.test(String(raw['file'])))
    throw new AtcError('ATC_USAGE', 'A model setup downloads a .gguf file.')
  for (const key of ['revision', 'model_id'] as const)
    if (raw[key] !== undefined && !text(raw[key]))
      throw new AtcError('ATC_USAGE', `${key} must be a non-empty string.`)
  return {
    repo: String(raw['repo']),
    file: String(raw['file']),
    ...(raw['revision'] !== undefined ? { revision: String(raw['revision']) } : {}),
    ...(raw['model_id'] !== undefined ? { model_id: String(raw['model_id']) } : {}),
    ...(raw['include_projector'] !== undefined
      ? { include_projector: raw['include_projector'] === true }
      : {}),
  }
}

export async function planFor(deps: GgufFactsDeps, request: ModelSetupPlanRequest): Promise<ModelSetupPlan> {
  const { link } = deps
  const families = await link
    .request<PrismFamiliesResponse>('GET', '/models/atomic-prism/families')
    .catch(() => ({ families: [] }) as unknown as PrismFamiliesResponse)
  const known = families.families.find(
    (f) =>
      f.repo === request.repo &&
      (!request.revision || request.revision === f.revision) &&
      f.files.some((file) => file.file === request.file || file.file === request.file.split('/').pop())
  )
  const token = hfToken(deps.env)
  const revision = known?.revision ?? request.revision
  const files = await fetchHfGgufFiles(request.repo, {
    fetch: deps.fetch,
    ...(revision ? { revision } : {}),
    ...(token ? { token } : {}),
  }).catch((error) => {
    if (error instanceof AtomicCoreError && /HTTP (401|403)/.test(error.message))
      throw new AtcError('ATC_USAGE', error.message, {
        details: error.details ?? 'Set HF_TOKEN for a gated repository.',
      })
    throw error
  })
  const artifacts = ggufShardSetPaths(request.file).map((path) => {
    const found = files.find((f) => f.filename === path)
    if (!found) throw new AtcError('ATC_USAGE', `"${path}" is not a GGUF file of ${request.repo}.`)
    if (
      !found.revision ||
      !/^[0-9a-f]{40}$/.test(found.revision) ||
      !Number.isSafeInteger(found.size) ||
      found.size <= 0
    )
      throw new AtcError('ATC_USAGE', 'The model has no complete immutable Hugging Face metadata.')
    return {
      repo: request.repo,
      file: path,
      revision: found.revision,
      size: found.size,
      ...(found.sha256 ? { sha256: found.sha256 } : {}),
    }
  })
  const selected = artifacts[0]!
  const expected = known?.files.find((file) => file.file === selected.file.split('/').pop())
  if (
    expected &&
    (expected.size !== selected.size || (selected.sha256 && expected.sha256 !== selected.sha256))
  )
    throw new AtcError('ATC_USAGE', 'The catalog and Hugging Face disagree about the selected model file.')
  const hubFile: GgufPlanInput['hubFile'] = {
    revision: selected.revision,
    size: selected.size,
    ...(selected.sha256 ? { sha256: selected.sha256 } : {}),
  }
  const [verdict, freeBytes] = await Promise.all([
    link.request<ModelCompatibilityResponse>('POST', '/models/compatibility', {
      repo: request.repo,
      file: selected.file,
      revision: selected.revision,
      inspect_remote: true,
    }),
    link.disk.available().catch(() => null),
  ])
  const family = matchFamily(families.families, verdict, request.file)
  const wantedProjector =
    request.include_projector === false ? undefined : family?.family.projectors.find((p) => p.default)
  let hubProjector: GgufPlanInput['hubProjector']
  if (wantedProjector && family) {
    const repo = family.family.repo
    const same = repo === request.repo && family.family.revision === selected.revision
    const listing = same
      ? files
      : await fetchHfGgufFiles(repo, {
          fetch: deps.fetch,
          revision: family.family.revision,
          ...(token ? { token } : {}),
        })
    const file = listing.find((f) => f.filename === wantedProjector.file)
    if (
      !file ||
      file.size !== wantedProjector.size ||
      (file.sha256 && file.sha256 !== wantedProjector.sha256)
    )
      throw new AtcError('ATC_USAGE', 'The catalog and Hugging Face disagree about the projector.')
    hubProjector = {
      repo,
      revision: file.revision!,
      file: file.filename,
      size: file.size,
      ...(file.sha256 ? { sha256: file.sha256 } : {}),
    }
  }
  const prism = verdict.provider === 'atomic-prism' ? await prismCatalog(link, verdict) : undefined
  return planGgufSetup({
    request,
    verdict,
    family,
    hubFile,
    hubFiles: artifacts,
    ...(hubProjector ? { hubProjector } : {}),
    prism,
    freeBytes,
  })
}

/**
 * The PrismML catalog for this verdict. A file that needs a build sends its `requires` and
 * `min_prism_build`, so the core's `recommended` is a build that runs it; `null` when the core has none
 * (`BACKEND_BUILD_UNAVAILABLE`). A compatible file asks without requirements for `recommended_installed`.
 */
async function prismCatalog(
  link: CoreLink,
  verdict: ModelCompatibilityResponse
): Promise<BackendCatalogResponse | null> {
  const needsBuild = verdict.outcome === 'engine_required' || verdict.outcome === 'engine_update_required'
  const body: BackendCatalogRequest = needsBuild
    ? {
        requires: verdict.requires,
        ...(verdict.min_prism_build !== undefined ? { min_build: verdict.min_prism_build } : {}),
      }
    : {}
  try {
    return await link.request<BackendCatalogResponse>('POST', '/backends/atomic-prism/catalog', body)
  } catch (error) {
    if (error instanceof AtomicCoreError && error.code === 'BACKEND_BUILD_UNAVAILABLE') return null
    throw error
  }
}
