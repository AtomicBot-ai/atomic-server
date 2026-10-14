import { describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../config/index.js'
import { ClientKeys } from '../terminal-data/index.js'
import { verifyWorkload } from './readiness.js'
import { coreOperation } from './core-operations.js'

describe('fresh workload readiness', () => {
  it('polls the jobId returned by Core for a real media verification job', async () => {
    const link = fakeCoreLink()
    link.request = async <T>(method: string, path: string, body?: unknown) => {
      link.calls.push({ method, path, body })
      if (path.endsWith('/capabilities')) return { ranges: { dims: [256, 1024], steps: [1, 50] } } as T
      if (method === 'POST') return { jobId: 'verification-id' } as T
      return { job: { state: 'completed' } } as T
    }
    await expect(
      verifyWorkload(link, defaultConfig(), new ClientKeys('/unused'), fetch, [
        {
          id: 'diffusion',
          provider: 'sd-cpp',
          model: 'test',
          kind: 'image-video',
          state: 'ready',
          details: { model: { loaded: { modality: 'image' } } },
        },
      ])
    ).resolves.toEqual({ task: 'image', job_id: 'verification-id' })
    expect(link.calls.at(-1)?.path).toBe('/diffusion/jobs/verification-id')
  })
  it('installs the selected GGUF engine before the first model load', async () => {
    const link = fakeCoreLink()
    link.request = async <T>(method: string, path: string, body?: unknown) => {
      link.calls.push({ method, path, body })
      if (method === 'GET') return { backends: [] } as T
      if (path.endsWith('/catalog'))
        return {
          recommended: 'b100/metal',
          available: [{ version: 'b100', backend: 'metal' }],
        } as T
      return { success: true } as T
    }
    await coreOperation(link, 'models.load', { provider: 'llamacpp-upstream', model_id: 'owner/model' })
    expect(link.calls.map((call) => call.path)).toEqual([
      '/backends/llamacpp-upstream',
      '/backends/llamacpp-upstream/catalog',
      '/engines/llamacpp-upstream/update',
      '/models/llamacpp-upstream/owner/model/load',
    ])
    expect(link.calls[2]?.body).toMatchObject({ target: { version: 'b100', variant: 'metal' } })
  })
})
