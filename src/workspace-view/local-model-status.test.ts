import { expect, it } from 'vitest'
import type { WorkspaceLoad, WorkspaceServiceRow } from '../contract/index.js'
import { catalogModelMatches, localModelStatus } from './local-model-status.js'

const identity = { model: 'local/model', providers: ['llamacpp-upstream'], kind: 'chat' as const }
const service = (over: Partial<WorkspaceServiceRow> = {}): WorkspaceServiceRow => ({
  id: 'session',
  model: identity.model,
  provider: 'llamacpp-upstream',
  kind: 'chat',
  state: 'ready',
  details: {},
  ...over,
})
const load: WorkspaceLoad = {
  provider: 'llamacpp-upstream',
  model_id: identity.model,
  stage: 'initializing-engine',
  generation: 'g',
  elapsed_ms: 0,
  at: 0,
}

it('distinguishes local file, live load, ready service and failed service', () => {
  expect(localModelStatus(null, [identity])).toBe('')
  expect(localModelStatus({ services: [], loads: [] }, [identity], true)).toBe('Downloaded')
  expect(localModelStatus({ services: [], loads: [load] }, [identity], true)).toBe('Loading…')
  expect(localModelStatus({ services: [service({ state: 'loading' })], loads: [] }, [identity])).toBe(
    'Loading…'
  )
  expect(localModelStatus({ services: [service()], loads: [] }, [identity])).toBe('Loaded')
  expect(localModelStatus({ services: [service({ state: 'failed' })], loads: [] }, [identity], true)).toBe(
    'Downloaded'
  )
})
it.each([
  { model: 'other/model' },
  { provider: 'mlx' },
  { kind: 'embedding' as const },
  { details: { cloud: true } },
])('does not mark a different or remote session loaded: %o', (over) => {
  expect(localModelStatus({ services: [service(over)], loads: [] }, [identity], true)).toBe('Downloaded')
})
it('qualifies progress by provider and kind, and ignores stale ready progress', () => {
  for (const progress of [
    { ...load, provider: 'mlx' as const },
    { ...load, model_id: 'other' },
    { ...load, stage: 'ready' as const },
  ])
    expect(localModelStatus({ services: [], loads: [progress] }, [identity], true)).toBe('Downloaded')
  expect(localModelStatus({ services: [], loads: [load] }, [{ ...identity, kind: 'embedding' }], true)).toBe(
    'Downloaded'
  )
})
it('preserves catalog repository, filename and quantized-family matching', () => {
  const jobs = [{ request: { repo: 'owner/family' }, plan: { model_id: 'saved-file' } }]
  for (const id of ['owner/family', 'owner/family/model.Q4.gguf', 'owner/family:q4', 'saved-file'])
    expect(catalogModelMatches(id, 'owner/family', jobs)).toBe(true)
  for (const id of ['other/family', 'owner/family-large', ''])
    expect(catalogModelMatches(id, 'owner/family', jobs)).toBe(false)
})
