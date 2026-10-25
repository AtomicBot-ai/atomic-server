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
import { fetchHfGgufFiles, hfToken } from '@atomic-chat/core/models'
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
  const [families, verdict, freeBytes] = await Promise.all([
    link
      .request<PrismFamiliesResponse>('GET', '/models/atomic-prism/families')
      .catch(() => ({ families: [] }) as unknown as PrismFamiliesResponse),
    link.request<ModelCompatibilityResponse>('POST', '/models/compatibility', {
      repo: request.repo,
      file: request.file,
      ...(request.revision ? { revision: request.revision } : {}),
      inspect_remote: true,
    }),
    link.disk.available().catch(() => null),
  ])
  const family = matchFamily(families.families, verdict, request.file)
  let hubFile: GgufPlanInput['hubFile']
  if (!family) {
    const token = hfToken(deps.env)
    // The listing the core reads also names the repository's commit; the plan pins it, so the URL
    // names exactly the bytes described here and a file uploaded again later is a different URL.
    let commit: string | undefined
    const files = await fetchHfGgufFiles(request.repo, {
      fetch: async (input, init) => {
        const response = await deps.fetch(input, init)
        const body = (await response
          .clone()
          .json()
          .catch(() => undefined)) as { sha?: unknown } | undefined
        if (typeof body?.sha === 'string' && /^[0-9a-f]{40}$/.test(body.sha)) commit = body.sha
        return response
      },
      ...(token ? { token } : {}),
    })
    const found = files.find((f) => f.filename === request.file)
    if (!found) throw new AtcError('ATC_USAGE', `"${request.file}" is not a GGUF file of ${request.repo}.`)
    hubFile = {
      size: found.size,
      ...(found.sha256 ? { sha256: found.sha256 } : {}),
      ...(commit ? { revision: commit } : {}),
    }
  }
  const prism = verdict.provider === 'atomic-prism' ? await prismCatalog(link, verdict) : undefined
  return planGgufSetup({ request, verdict, family, ...(hubFile ? { hubFile } : {}), prism, freeBytes })
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
