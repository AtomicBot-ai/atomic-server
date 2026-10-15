/**
 * What a GGUF setup plan is made of, gathered now: the Bonsai families and the compatibility verdict
 * from the core, the Hub's size and hash for a file no family pins, the PrismML catalog when the
 * verdict involves PrismML, and free space. Then `planGgufSetup` decides.
 */
import type {
  BackendCatalogResponse,
  ModelCompatibilityResponse,
  PrismFamiliesResponse,
} from '@atomic-chat/core/contracts'
import { fetchHfGgufFiles, hfToken } from '@atomic-chat/core/models'
import type { CoreLink } from '../core-link/index.js'
import type { ModelSetupPlan, ModelSetupPlanRequest } from '../contract/index.js'
import { AtcError } from '../errors/index.js'
import { matchFamily, planGgufSetup } from './gguf-plan.js'

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
  const family = matchFamily(families.families, request.repo, request.file)
  let hubFile: { size: number; sha256?: string } | undefined
  if (!family) {
    const token = hfToken(deps.env)
    const files = await fetchHfGgufFiles(request.repo, { fetch: deps.fetch, ...(token ? { token } : {}) })
    const found = files.find((f) => f.filename === request.file)
    if (!found) throw new AtcError('ATC_USAGE', `"${request.file}" is not a GGUF file of ${request.repo}.`)
    hubFile = { size: found.size, ...(found.sha256 ? { sha256: found.sha256 } : {}) }
  }
  const prism =
    verdict.provider === 'atomic-prism'
      ? await link.request<BackendCatalogResponse>('POST', '/backends/atomic-prism/catalog', {})
      : undefined
  return planGgufSetup({ request, verdict, family, ...(hubFile ? { hubFile } : {}), prism, freeBytes })
}
