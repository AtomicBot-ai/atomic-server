import { expect, it } from 'vitest'
import type { WorkspaceLoad, WorkspaceServiceRow } from '../../contract/index.js'
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

it.each([
  ['flux:q4', 'flux', true],
  ['flux:fp16', 'flux', true],
  ['repo/model/q4.gguf', 'repo/model', true],
  ['repo/model', 'repo/model', true],
  ['flux-next:q4', 'flux', false],
  ['repo/model-new', 'repo/model', false],
])('matches installed %s to catalog family %s: %s', (id, family, expected) => {
  expect(catalogModelMatches(id, family)).toBe(expected)
})

// A catalog download is registered under its file name (`LiquidAI/LFM2-1.2B-Q4_K_M` for the
// `LiquidAI/LFM2-1.2B-GGUF` row): the row's repository on the installed model, or the GGUF naming
// rule for models downloaded before it was recorded, ties them back together without the setup record.
it.each([
  ['LiquidAI/LFM2-1.2B-Q4_K_M', 'LiquidAI/LFM2-1.2B-GGUF', 'LiquidAI/LFM2-1.2B-GGUF', true],
  ['LiquidAI/LFM2-1.2B-Q4_K_M', 'LiquidAI/LFM2-1.2B-GGUF', undefined, true],
  ['AtomicChat/Qwen3.8-27B-UD-Q4_K_XL', 'AtomicChat/Qwen3.8-27B-GGUF', undefined, true],
  ['LiquidAI/LFM2.5-1.2B-Instruct-Q4_K_M', 'LiquidAI/LFM2-1.2B-GGUF', undefined, false],
  ['LiquidAI/LFM2-1.2B-Q4_K_M', 'LiquidAI/LFM2-1.2B-gguf', undefined, true],
  ['imported/Qwen3-0.6B-Q8_0-3bdffbe2', 'AtomicChat/Qwen3-0.6B-GGUF', 'LiquidAI/other', false],
  // Only an owner/repo row names a Hub download; a bare id ending in -gguf is not one.
  ['local-mlx', 'local-gguf', undefined, false],
  // Another model of the same family is not this row's download.
  ['owner/name-Instruct-Q4_K_M', 'owner/name-GGUF', undefined, false],
  ['owner/name-Q8_0', 'owner/name-GGUF', undefined, true],
  ['owner/name-IQ4_XS', 'owner/name-GGUF', undefined, true],
])('ties %s to the catalog row %s (repository %s): %s', (id, family, repository, expected) => {
  expect(catalogModelMatches(id, family, [], repository)).toBe(expected)
})
