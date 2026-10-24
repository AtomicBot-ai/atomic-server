import type { DownloadRow } from './downloads.js'
export type DownloadOwner = 'setup' | 'artifacts' | 'managed' | 'foundry' | 'litert'
/** The services whose jobs resume by installing their plan again, by job kind. */
const PLAN_OWNERS: Record<string, DownloadOwner> = {
  'managed-model': 'managed',
  'foundry-model': 'foundry',
  'litert-model': 'litert',
}
export function downloadOwner(job: Record<string, unknown>): DownloadOwner | null {
  const planOwner = PLAN_OWNERS[String(job['kind'])]
  if (planOwner) return planOwner
  return job['owner'] === 'download' ? null : job['owner'] === 'artifacts' ? 'artifacts' : 'setup'
}
export const downloadPaused = (state: string) => /paused|cancelled|failed|interrupted/.test(state)
export function downloadControl(job: DownloadRow, action: 'pause' | 'resume') {
  const owner = downloadOwner(job)
  if (!owner) return null
  const plan = job['plan'] as Record<string, unknown> | undefined
  if (action === 'resume' && Object.values(PLAN_OWNERS).includes(owner))
    return { operation: `${owner}.install`, input: { request_id: job.id, plan_digest: plan?.['digest'] } }
  return {
    operation: `${owner}.${action === 'pause' ? 'cancel' : 'resume'}`,
    input: owner === 'setup' ? { setup_id: job.id } : { id: job.id },
  }
}
