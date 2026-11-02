/** Resume by request id before querying HF or reading the current catalog. */
import type { CommandContext } from '../../cli/index.js'
import { AtcError } from '../../cli/index.js'
import type { ModelSetup } from '../../contract/index.js'
import type { WorkspaceClient } from '../../workspace-service/index.js'

export async function resumeGgufPull(
  ctx: CommandContext,
  service: WorkspaceClient,
  repo: string,
  file: string,
  values: Record<string, unknown>
): Promise<boolean> {
  if (values['dry-run'] || typeof values['request-id'] !== 'string') return false
  const { setups } = (await service.execute('setup.status', {})) as { setups: ModelSetup[] }
  const existing = setups.find((job) => job.request_id === values['request-id'])
  if (!existing) return false
  if (existing.request.repo !== repo || (file && existing.request.file !== file))
    throw new AtcError('ATC_USAGE', 'This request ID belongs to another model download.')
  const job =
    existing.stage === 'ready'
      ? existing
      : ((await service.execute('setup.resume', { setup_id: existing.setup_id })) as ModelSetup)
  ctx.out.result(job, () => ctx.out.line(`${job.plan.model_id}: ${job.stage} — ${job.setup_id}`))
  return true
}
