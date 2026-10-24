import { expect, it } from 'vitest'
import { downloadControl, downloadOwner, downloadPaused, downloadRows } from './index.js'
it.each([
  ['setup', {}, 'setup.resume', { setup_id: 'job' }],
  ['artifacts', { plan: { category: 'image' } }, 'artifacts.resume', { id: 'job' }],
  [
    'managed',
    { kind: 'managed-model', plan: { digest: 'digest' } },
    'managed.install',
    { request_id: 'job', plan_digest: 'digest' },
  ],
  [
    'foundry',
    { kind: 'foundry-model', plan: { digest: 'digest' } },
    'foundry.install',
    { request_id: 'job', plan_digest: 'digest' },
  ],
])('routes %s controls to the owning service', (owner, more, operation, input) => {
  const row = downloadRows([{ id: 'job', state: 'cancelled', ...more }], [])[0]!
  expect(downloadOwner(row)).toBe(owner)
  expect(downloadPaused(row.state)).toBe(true)
  expect(downloadControl(row, 'resume')).toEqual({ operation, input })
  expect(downloadControl(row, 'pause')?.operation).toBe(`${owner}.cancel`)
})
it('does not pretend a core-owned engine transfer has model download controls', () => {
  const row = downloadRows([], [{ taskId: 'engine', transferred: 1, total: 5 }])[0]!
  expect(downloadOwner(row)).toBeNull()
  expect(downloadControl(row, 'pause')).toBeNull()
})
