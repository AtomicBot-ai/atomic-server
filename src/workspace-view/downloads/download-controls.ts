import type { DownloadRow } from './downloads.js'
export type DownloadOwner =
  'setup' | 'artifacts' | 'managed' | 'foundry' | 'litert' | 'geniex' | 'fastflowlm' | 'strata'
/** The services whose jobs resume by installing their plan again, by job kind. */
const PLAN_OWNERS: Record<string, DownloadOwner> = {
  'managed-model': 'managed',
  'foundry-model': 'foundry',
  'geniex-model': 'geniex',
  'fastflowlm-model': 'fastflowlm',
  'strata-model': 'strata',
  'litert-model': 'litert',
}
export function downloadOwner(job: Record<string, unknown>): DownloadOwner | null {
  const planOwner = PLAN_OWNERS[String(job['kind'])]
  if (planOwner) return planOwner
  return job['owner'] === 'download' ? null : job['owner'] === 'artifacts' ? 'artifacts' : 'setup'
}
/** Stopped for any reason: paused, cancelled, failed or interrupted. */
export const downloadStopped = (state: string) => /paused|cancelled|failed|interrupted/.test(state)
/** Paused by a person (Pause or cancel), as opposed to failed or interrupted. */
export const downloadHeld = (state: string) => /paused|cancelled/.test(state)
/** What every client calls a download's state: one held by a person is Paused, never "cancelled". */
export function downloadStateLabel(state: string, completed = false): string {
  if (completed) return 'Downloaded'
  if (state === 'preparing') return 'Preparing model'
  return downloadHeld(state) ? 'Paused' : state.replaceAll('_', ' ')
}
export function strataPreparationNotice(job: Record<string, unknown>, state: string): string | undefined {
  if (job['kind'] === 'strata-model' && state === 'preparing')
    return 'Preparing Strata model. This can take a few minutes.'
}
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
