import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../config/index.js'
import { WorkspaceService } from './index.js'
const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
describe('durable media installation', () => {
  it('downloads catalog-pinned files in the background, keeps the job and loads via the task module', async () => {
    const tmp = tmpDataFolder()
    cleanup.push(tmp.cleanup)
    const payload = 'small test checkpoint',
      sha = createHash('sha256').update(payload).digest('hex'),
      link = fakeCoreLink()
    const original = link.request
    link.request = async <T>(
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      path: string,
      body?: unknown
    ) =>
      path === '/backends/llamacpp-upstream'
        ? ({ backends: [{ version: 'test' }] } as T)
        : original<T>(method, path, body)
    let release!: (response: Response) => void
    const download = new Promise<Response>((resolve) => {
      release = resolve
    })
    const request = vi.fn<typeof fetch>(async (input) =>
      String(input).includes('raw.githubusercontent.com')
        ? new Response(
            JSON.stringify({
              models: [
                {
                  id: 'tiny',
                  name: 'Tiny',
                  repo: 'test/tiny',
                  revision: 'pinned',
                  context: 512,
                  engine: 'llamacpp-upstream',
                  files: [{ path: 'tiny.gguf', role: 'model', bytes: payload.length, sha256: sha }],
                },
              ],
            })
          )
        : download
    )
    const options = { paths: tmp.paths, link, config: defaultConfig(), fetch: request },
      service = new WorkspaceService(options)
    const plan = (await service.execute('artifacts.plan', { category: 'embedding', model_id: 'tiny' })) as {
      digest: string
    }
    const job = (await service.execute('artifacts.install', {
      plan_digest: plan.digest,
      request_id: 'test-install',
    })) as { id: string }
    expect(job.id).toBe('test-install')
    expect(await service.execute('artifacts.list')).toMatchObject([
      { id: 'test-install', stage: expect.stringMatching(/queued|installing_engine|downloading/) },
    ])
    await expect(
      service.execute('artifacts.install', { plan_digest: 'another-plan', request_id: 'test-install' })
    ).rejects.toThrow('another plan')
    release(new Response(payload, { headers: { 'content-length': String(payload.length) } }))
    let jobs: Array<{ stage: string; error?: string }> = []
    for (let attempt = 0; attempt < 100; attempt++) {
      jobs = (await service.execute('artifacts.list')) as typeof jobs
      if (jobs[0]?.stage === 'ready' || jobs[0]?.stage === 'failed') break
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    expect(jobs[0]).toMatchObject({ stage: 'ready' })
    const reconnected = new WorkspaceService(options)
    await reconnected.execute('artifacts.load', { id: 'test-install' })
    expect(link.calls).toContainEqual(
      expect.objectContaining({
        method: 'PUT',
        path: '/embedding/config',
        body: expect.objectContaining({ enabled: true, model_id: 'tiny' }),
      })
    )
    expect(link.calls).toContainEqual({ method: 'POST', path: '/embedding/load', body: {} })
  })
})
