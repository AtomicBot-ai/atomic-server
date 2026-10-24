export { downloadRows } from '@view'

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/** The engine and model id a finished job loads with, from its plan: never a default engine. */
export function loadTarget(job: Record<string, unknown>): { provider: string; model_id: string } {
  const plan = record(job.plan)
  if (job.kind === 'managed-model')
    return { provider: String(plan.engine), model_id: String(plan.repository) }
  if (job.kind === 'foundry-model') return { provider: 'foundry-local', model_id: String(plan.variant_id) }
  if (job.kind === 'litert-model') return { provider: 'litert-lm', model_id: String(plan.variant_id) }
  return {
    provider: String(job.provider ?? plan.provider ?? ''),
    model_id: String(job.model_id ?? plan.model_id ?? ''),
  }
}

const OWNERS: Record<string, string> = {
  'managed-model': 'managed',
  'foundry-model': 'foundry',
  'litert-model': 'litert',
}

/** The operations that resume or cancel a job, by who owns it: a store, Foundry or LiteRT-LM job, media, a setup. */
export function jobOperations(job: Record<string, unknown>, id: string, media: boolean) {
  const own = OWNERS[String(job.kind)]
  if (own)
    return {
      resume: [`${own}.install`, { request_id: id, plan_digest: record(job.plan).digest }] as const,
      cancel: [`${own}.cancel`, { id }] as const,
    }
  return media
    ? { resume: ['artifacts.resume', { id }] as const, cancel: ['artifacts.cancel', { id }] as const }
    : {
        resume: ['setup.resume', { setup_id: id }] as const,
        cancel: ['setup.cancel', { setup_id: id }] as const,
      }
}
