import { expect, it } from 'vitest'
import { mediaDownload } from './media-download'
it('uses the latest attempt for a matching media model without confusing related names', () => {
  const jobs = [
    { id: 'new', stage: 'paused', updated_at: 20, plan: { model_id: 'flux:Q4' } },
    { id: 'old', stage: 'failed', updated_at: 10, plan: { model_id: 'flux:Q4' } },
    { id: 'other', updated_at: 30, plan: { model_id: 'flux-pro:Q4' } },
  ]
  expect(mediaDownload(jobs, 'flux')?.id).toBe('new')
  expect(mediaDownload(jobs, 'missing')).toBeUndefined()
})
