import { record } from '../types'
import type { RecordValue } from '../types'

export function mediaDownload(jobs: unknown[], model: string) {
  return jobs
    .map(record)
    .filter((job) =>
      [record(job.plan).model_id, job.model_id].some(
        (id) => typeof id === 'string' && (id === model || id.startsWith(model + ':'))
      )
    )
    .reduce<RecordValue | undefined>((previous, job) => {
      if (!previous) return job
      const before = Number(previous.updated_at ?? previous.created_at ?? 0)
      const after = Number(job.updated_at ?? job.created_at ?? 0)
      return after >= before ? job : previous
    }, undefined)
}
