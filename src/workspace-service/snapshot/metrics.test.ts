import { expect, it } from 'vitest'
import { WorkspaceMetrics } from './metrics.js'

const finished = (finish: Record<string, unknown>) => ({
  id: 'r1',
  phase: 'finished',
  finished_at_ms: 1000,
  observation: { model_id: 'm', endpoint: '/v1/chat/completions', status: 200 },
  finish: { duration_ms: 900, ttft_ms: 100, completion_tokens: 40, tokens_estimated: false, ...finish },
})

it('keeps the window a request ran with and the prompt tokens the engine reused', () => {
  const metrics = new WorkspaceMetrics()
  metrics.event('api:request', finished({ ctx_len: 65536, cached_tokens: 12000 }))
  expect(metrics.snapshot(1000).requests).toMatchObject([
    { id: 'r1', context_length: 65536, cached_tokens: 12000, completion_tokens: 40 },
  ])
})

it('leaves both empty for a core that does not send them', () => {
  const metrics = new WorkspaceMetrics()
  metrics.event('api:request', finished({}))
  expect(metrics.snapshot(1000).requests).toMatchObject([{ context_length: null, cached_tokens: null }])
})
