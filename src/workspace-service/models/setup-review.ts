/** Resolve the catalog, inspect immutable HF metadata, then persist the reviewed GGUF plan. */
import { atomicModelRevision } from '@atomic-chat/core/client'
import { join } from 'node:path'
import type { ModelSetupPlan } from '../../contract/index.js'
import { writeDocument } from '../../terminal-data/index.js'
import { unifiedCatalog } from './unified-catalog.js'
import { planFor, planRequest } from './gguf-facts.js'
import type { ModelSetupsDeps } from './model-setups.js'
import { withSetupDestinations } from './model-setup-run.js'

export async function reviewSetupPlan(
  deps: ModelSetupsDeps,
  directory: string,
  raw: Record<string, unknown>
): Promise<ModelSetupPlan> {
  const request = planRequest(raw)
  if (!request.revision) {
    const result = await unifiedCatalog(
      deps.paths.cacheDir,
      deps.fetch,
      false,
      deps.env['ATC_MODEL_CATALOG_URL']
    )
    const revision = atomicModelRevision(result.catalog, request.repo)
    if (revision) request.revision = revision
  }
  const plan = withSetupDestinations(deps.paths, await planFor(deps, request))
  await writeDocument(join(directory, 'plans', `${plan.digest}.json`), { request, plan })
  return plan
}
