import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../config/index.js'
import { writeDocument } from '../terminal-data/index.js'
import { ArtifactService } from './artifacts.js'
import { WorkspaceCatalog } from './catalog.js'
import type { ArtifactPlan } from './artifact-plan.js'
const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
async function fixture() {
  const tmp = tmpDataFolder(),
    link = fakeCoreLink(),
    payload = 'tiny weights'
  cleanup.push(tmp.cleanup)
  let release!: () => void,
    installs = 0
  const engine = new Promise<void>((resolve) => {
    release = resolve
  })
  link.request = async <T>(method: string, path: string, body?: unknown) => {
    link.calls.push({ method, path, body })
    if (path === '/backends/llamacpp-upstream') return { backends: [] } as T
    if (path.endsWith('/catalog'))
      return {
        recommended: '1/cpu',
        available: [{ version: '1', backend: 'cpu' }],
      } as T
    if (path.endsWith('/update')) {
      installs++
      await engine
    }
    return {} as T
  }
  const request = vi.fn<typeof fetch>(
    async () =>
      new Response(payload, {
        headers: { 'content-length': String(payload.length) },
      })
  )
  const options = { paths: tmp.paths, link, config: defaultConfig(), fetch: request }
  const service = new ArtifactService(options, new WorkspaceCatalog(tmp.paths, request), request)
  const plan: ArtifactPlan = {
    digest: 'reviewed-plan',
    category: 'embedding',
    model_id: 'tiny',
    name: 'Tiny',
    engine: 'llamacpp-upstream',
    files: [
      {
        url: 'https://huggingface.co/test/tiny/resolve/pinned/model.gguf',
        save_path: 'workspace-models/embedding/tiny/model.gguf',
        size: payload.length,
        sha256: createHash('sha256').update(payload).digest('hex'),
      },
    ],
    total_download_bytes: payload.length,
    load: {},
    created_at: Date.now(),
  }
  await writeDocument(join(tmp.paths.atcDir, 'media-installations', 'reviewed-plan.json'), plan)
  return { service, release, request, installs: () => installs }
}
describe('artifact worker serialization', () => {
  it('serializes duplicate requests and shared family destinations', async () => {
    const f = await fixture()
    await Promise.all([
      f.service.install({ plan_digest: 'reviewed-plan', request_id: 'first' }),
      f.service.install({ plan_digest: 'reviewed-plan', request_id: 'first' }),
      f.service.install({ plan_digest: 'reviewed-plan', request_id: 'second' }),
    ])
    await vi.waitFor(() => expect(f.installs()).toBe(1))
    expect(f.request).not.toHaveBeenCalled()
    f.release()
    await vi.waitFor(async () =>
      expect((await f.service.list()).map((job) => job.stage)).toEqual(['ready', 'ready'])
    )
    expect(f.installs()).toBe(2)
    // Both jobs finish through separate, sequential writers; the duplicate request adds no worker.
    expect(f.request).toHaveBeenCalledTimes(2)
  })
  it('keeps cancellation through engine completion and waits before a resumed writer starts', async () => {
    const f = await fixture()
    await f.service.install({ plan_digest: 'reviewed-plan', request_id: 'cancel-me' })
    await vi.waitFor(() => expect(f.installs()).toBe(1))
    await f.service.cancel('cancel-me')
    const resume = f.service.resume('cancel-me')
    expect(f.request).not.toHaveBeenCalled()
    f.release()
    await resume
    await vi.waitFor(async () => expect((await f.service.list())[0]?.stage).toBe('ready'))
    expect(f.installs()).toBe(2)
    expect(f.request).toHaveBeenCalledTimes(1)
  })
})
