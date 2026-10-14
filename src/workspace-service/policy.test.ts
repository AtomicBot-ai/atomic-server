import { describe, expect, it } from 'vitest'
import { WorkspaceMetrics } from './metrics.js'
import { sanitized } from './validation.js'
import { artifactPlan } from './artifact-plan.js'
import { installEngine } from './engine-install.js'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
describe('workspace policies', () => {
  it('redacts credentials without stripping token usage or model metadata', () => {
    expect(
      sanitized({
        api_key: 'secret',
        nested: { token: 'private', completion_tokens: 12, tokenizer: 'bpe' },
        env: { AUTH: 'secret' },
      })
    ).toEqual({ nested: { completion_tokens: 12, tokenizer: 'bpe' } })
  })
  it('calculates weighted decode rate and uses unknown for unavailable live metrics', () => {
    const metrics = new WorkspaceMetrics(),
      now = Date.now()
    metrics.event('api:request', {
      id: '1',
      phase: 'finished',
      finished_at_ms: now,
      observation: { status: 200, model_id: 'q' },
      finish: { duration_ms: 3000, ttft_ms: 1000, completion_tokens: 20 },
    })
    metrics.event('api:request', {
      id: '2',
      phase: 'finished',
      finished_at_ms: now,
      observation: { status: 500 },
      finish: { duration_ms: 5000, ttft_ms: 1000, completion_tokens: 60 },
    })
    const result = metrics.snapshot(now)
    expect(result.metrics.tokens_per_second).toBeCloseTo(80 / 6)
    expect(result.metrics.errors).toBe(1)
    expect(result.metrics.active).toBeNull()
    expect(metrics.snapshot(now + 300001).metrics.requests).toBe(0)
  })
  it('resolves catalog media dependencies, wire aliases and digest deterministically', () => {
    const row = {
      id: 'model',
      name: 'Model',
      description: '',
      category: 'video' as const,
      source: {
        transformer: {
          repo: 'owner/repo',
          quants: [{ id: 'q4', filename: 'model.gguf', bytes: 10, recommended: true }],
        },
        text_encoders: [{ field: 'clip_l', repo: 'owner/clip', filename: 'clip.gguf', bytes: 20 }],
        defaults: { steps: 4, cfg_scale: 1, width: 512, height: 512 },
        ranges: { steps: [1, 20], dims: [256, 1024], dim_multiple: 32 },
        video: {
          fps: 24,
          frames: 9,
          frame_step: 8,
          frame_offset: 1,
          frame_range: [9, 121],
          resolution_presets: [[512, 512]],
        },
      },
    }
    const plan = artifactPlan(row, '/data')
    expect(plan.total_download_bytes).toBe(30)
    expect(plan.load).toMatchObject({
      files: { clipL: '/data/workspace-models/video/model/clipL/clip.gguf' },
      ranges: { frames: [9, 121] },
    })
    expect(artifactPlan(row, '/data').digest).toBe(plan.digest)
    expect(() => artifactPlan({ ...row, id: '../escape' }, '/data')).toThrow('Invalid catalog identifier')
  })
  it('selects a recommended target when installing a fresh llama engine', async () => {
    const link = fakeCoreLink()
    const original = link.request
    link.request = async <T>(
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      path: string,
      body?: unknown
    ) => {
      if (path.endsWith('/catalog'))
        return { recommended: 'b100/metal', available: [{ version: 'b100', backend: 'metal' }] } as T
      return original<T>(method, path, body)
    }
    await installEngine(link, 'llamacpp-upstream')
    expect(link.calls[0]).toMatchObject({
      path: '/engines/llamacpp-upstream/update',
      body: { target: { version: 'b100', variant: 'metal' } },
    })
  })
})
