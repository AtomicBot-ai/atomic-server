import type { DownloadRow } from './downloads.js'
export type DownloadOwner = 'setup' | 'artifacts' | 'managed' | 'foundry'
export function downloadOwner(job: Record<string, unknown>): DownloadOwner | null {
  return job['kind'] === 'managed-model'
    ? 'managed'
    : job['kind'] === 'foundry-model'
      ? 'foundry'
      : job['owner'] === 'download'
        ? null
        : job['owner'] === 'artifacts'
          ? 'artifacts'
          : 'setup'
}
export const downloadPaused = (state: string) => /paused|cancelled|failed|interrupted/.test(state)
export function downloadControl(job: DownloadRow, action: 'pause' | 'resume') {
  const owner = downloadOwner(job)
  if (!owner) return null
  const plan = job['plan'] as Record<string, unknown> | undefined
  if (action === 'resume' && ['managed', 'foundry'].includes(owner))
    return { operation: `${owner}.install`, input: { request_id: job.id, plan_digest: plan?.['digest'] } }
  return {
    operation: `${owner}.${action === 'pause' ? 'cancel' : 'resume'}`,
    input: owner === 'setup' ? { setup_id: job.id } : { id: job.id },
  }
}
