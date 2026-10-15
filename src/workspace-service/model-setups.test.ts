import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { waitFor } from '../../test/helpers/wait-for.js'
import { Downloader } from '../downloads/index.js'
import type { ModelSetup, ModelSetupPlan } from '../contract/index.js'
import { ModelSetups } from './model-setups.js'

const weights = Buffer.alloc(256 * 1024, 3)
const sha = createHash('sha256').update(weights).digest('hex')
const projector = Buffer.from('projector bytes')
const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))

/** The Hub: the repo listing, then file bodies with Range; `hold` stops a body halfway until released. */
function hub() {
  const state = { hold: false, release: () => {}, ranges: [] as string[] }
  const request: typeof fetch = async (input, init) => {
    const url = String(input)
    if (url.includes('/api/models/'))
      return Response.json({
        siblings: [
          {
            rfilename: 'model.Q4_K_M.gguf',
            size: weights.length,
            lfs: { sha256: sha, size: weights.length },
          },
        ],
      })
    const body = url.endsWith('mmproj.gguf') ? projector : weights
    const range = new Headers(init?.headers).get('range')
    if (range) state.ranges.push(range)
    const start = Number(/bytes=(\d+)-/.exec(range ?? '')?.[1] ?? 0)
    const slice = body.subarray(start)
    const half = slice.subarray(0, Math.floor(slice.length / 2))
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        if (!state.hold || body === projector) {
          controller.enqueue(new Uint8Array(slice))
          controller.close()
          return
        }
        controller.enqueue(new Uint8Array(half))
        await new Promise<void>((resolve) => (state.release = resolve))
        controller.enqueue(new Uint8Array(slice.subarray(half.length)))
        controller.close()
      },
    })
    init?.signal?.addEventListener('abort', () => state.release())
    return new Response(stream, {
      status: range ? 206 : 200,
      headers: {
        'content-length': String(slice.length),
        ...(range ? { 'content-range': `bytes ${start}-${body.length - 1}/${body.length}` } : {}),
      },
    })
  }
  return { state, request }
}

function fixture(core: { prism?: boolean; verdictAfter?: string } = {}) {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const link = fakeCoreLink()
  const { state, request } = hub()
  const packs: Array<{ version: string; backend: string }> = []
  link.request = async <T>(method: string, path: string, body?: unknown) => {
    link.calls.push({ method, path, body })
    const input = (body ?? {}) as Record<string, unknown>
    if (path === '/models/atomic-prism/families')
      return {
        families: core.prism
          ? [
              {
                id: 'bonsai',
                title: 'Bonsai',
                repo: 'prism-ml/Bonsai-gguf',
                revision: 'pinned',
                files: [
                  {
                    file: 'Bonsai-Q1_0.gguf',
                    size: weights.length,
                    sha256: sha,
                    treatment: 'prism_required',
                  },
                ],
                projectors: [
                  {
                    file: 'mmproj.gguf',
                    size: projector.length,
                    sha256: createHash('sha256').update(projector).digest('hex'),
                    default: true,
                  },
                ],
              },
            ]
          : [],
      } as T
    if (path === '/models/compatibility') {
      const onDisk = typeof input['model_id'] === 'string'
      const outcome = onDisk
        ? (core.verdictAfter ?? 'compatible')
        : core.prism
          ? 'engine_required'
          : 'compatible'
      return {
        outcome,
        provider: core.prism ? 'atomic-prism' : null,
        requires: core.prism ? ['q1_0'] : [],
        evidence: 'header',
        rules_version: 1,
        reason: outcome === 'compatible' ? 'fine' : 'The file needs another engine.',
        ...(core.prism ? { min_prism_build: 2, family: 'bonsai' } : {}),
      } as T
    }
    if (path === '/backends/atomic-prism/catalog')
      return {
        available: [{ version: 'prism-b3-abcdef0', backend: 'cpu' }],
        installed: packs,
        recommended: 'prism-b3-abcdef0/cpu',
        recommended_installed: null,
        releases: [{ tag: 'prism-b3-abcdef0', variants: [{ id: 'cpu', size: 10 }] }],
      } as T
    if (path === '/backends/atomic-prism/install') packs.push({ version: 'prism-b3-abcdef0', backend: 'cpu' })
    return {} as T
  }
  const downloader = new Downloader({
    dataFolder: tmp.paths.dataFolder,
    platform: 'linux',
    fetch: request,
    availableSpace: async () => undefined,
  })
  const make = () =>
    new ModelSetups({ link, paths: tmp.paths, downloader, fetch: request, env: { HF_TOKEN: 'hf_secret' } })
  return { tmp, link, hub: state, make, downloader }
}
const settle = async (setups: ModelSetups, id: string, stages = ['ready', 'failed', 'cancelled']) => {
  let record: ModelSetup | undefined
  await waitFor(async () => {
    record = await setups.get(id)
    return stages.includes(record.stage)
  })
  return record as ModelSetup
}
const install = async (setups: ModelSetups, repo: string, file: string, requestId = 'req-1') => {
  const plan = (await setups.plan({ repo, file })) as ModelSetupPlan
  return setups.install({ request: { repo, file }, plan_digest: plan.digest, request_id: requestId })
}

describe('ModelSetups', () => {
  it('downloads a stock GGUF itself, registers it and checks it by model_id', async () => {
    const f = fixture()
    const setups = f.make()
    const started = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf')
    const done = await settle(setups, started.setup_id)
    expect(done).toMatchObject({
      stage: 'ready',
      plan: { model_id: 'owner/model.Q4_K_M', provider: 'llamacpp-upstream' },
    })
    const dir = join(f.tmp.paths.layout.root, 'llamacpp/models/owner/model.Q4_K_M')
    expect((await readFile(join(dir, 'model.Q4_K_M.gguf'))).equals(weights)).toBe(true)
    expect(await readFile(join(dir, 'model.yml'), 'utf8')).toContain('model_sha256')
    expect(f.link.calls).toContainEqual(
      expect.objectContaining({
        path: '/models/compatibility',
        body: { model_id: 'owner/model.Q4_K_M', provider: 'llamacpp-upstream' },
      })
    )
    expect(f.link.calls.some((c) => c.path.includes('model-setups') || c.path.includes('setup-plan'))).toBe(
      false
    )
    expect(JSON.stringify(await setups.list())).not.toContain('hf_secret')
    expect(await install(setups, 'owner/repo', 'model.Q4_K_M.gguf')).toMatchObject({
      setup_id: started.setup_id,
    })
  })

  it('installs and activates the PrismML build through the core before downloading Bonsai and its projector', async () => {
    const f = fixture({ prism: true })
    const setups = f.make()
    const started = await install(setups, 'prism-ml/Bonsai-gguf', 'Bonsai-Q1_0.gguf')
    expect(started.task_ids).toMatchObject({ engine: expect.any(String), projector: expect.any(String) })
    expect(await settle(setups, started.setup_id)).toMatchObject({ stage: 'ready' })
    const order = f.link.calls.map((c) => c.path)
    expect(order.indexOf('/backends/atomic-prism/install')).toBeLessThan(
      order.indexOf('/engines/atomic-prism/builds/prism-b3-abcdef0/cpu/activate')
    )
    const yml = await readFile(
      join(f.tmp.paths.layout.root, 'llamacpp/models/prism-ml/Bonsai-Q1_0/model.yml'),
      'utf8'
    )
    expect(yml).toContain('atomic_runtime')
    expect(yml).toContain('mmproj_path')
  })

  it('fails and removes a downloaded file whose header the core does not accept', async () => {
    const f = fixture({ verdictAfter: 'unsupported' })
    const setups = f.make()
    const started = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf')
    expect(await settle(setups, started.setup_id)).toMatchObject({
      stage: 'failed',
      error: { message: 'The file needs another engine.' },
    })
    await expect(stat(join(f.tmp.paths.layout.root, 'llamacpp/models/owner/model.Q4_K_M'))).rejects.toThrow()
  })

  it('cancels mid-file and resumes from the bytes on disk', async () => {
    const f = fixture()
    f.hub.hold = true
    const setups = f.make()
    const started = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf')
    await waitFor(() => (f.downloader.snapshot()[0]?.transferred ?? 0) === weights.length / 2)
    expect((await setups.cancel(started.setup_id)).stage).toBe('cancelled')
    f.hub.hold = false
    await setups.resume(started.setup_id)
    expect(await settle(setups, started.setup_id)).toMatchObject({ stage: 'ready' })
    expect(f.hub.ranges).toEqual([`bytes=${weights.length / 2}-`])
  })

  it('shows a setup a stopped server left as interrupted and continues it after the restart', async () => {
    const f = fixture()
    f.hub.hold = true
    const first = f.make()
    const started = await install(first, 'owner/repo', 'model.Q4_K_M.gguf')
    await waitFor(() => (f.downloader.snapshot()[0]?.transferred ?? 0) === weights.length / 2)
    f.downloader.cancel(started.task_ids.model)
    await settle(first, started.setup_id, ['cancelled', 'failed'])
    // The record a crashed server leaves behind: mid-download, nobody running it.
    const record = join(f.tmp.paths.atcDir, 'model-setups', `${started.setup_id}.json`)
    const raw = JSON.parse(await readFile(record, 'utf8'))
    await import('node:fs/promises').then((fs) =>
      fs.writeFile(record, JSON.stringify({ ...raw, stage: 'downloading_model' }))
    )
    f.hub.hold = false
    const restarted = f.make()
    expect((await restarted.list())[0]).toMatchObject({
      stage: 'interrupted',
      stopped_at: 'downloading_model',
    })
    await restarted.resume(started.setup_id)
    expect(await settle(restarted, started.setup_id)).toMatchObject({ stage: 'ready' })
    expect(f.hub.ranges).toEqual([`bytes=${weights.length / 2}-`])
  })

  it('returns the running setup of the same model instead of starting a second writer', async () => {
    const f = fixture()
    f.hub.hold = true
    const setups = f.make()
    const first = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf', 'req-1')
    const second = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf', 'req-2')
    expect(second.setup_id).toBe(first.setup_id)
    expect(await setups.list()).toHaveLength(1)
    await setups.cancel(first.setup_id)
  })

  it('refuses an install whose plan was not reviewed here', async () => {
    const f = fixture()
    await expect(
      f.make().install({
        request: { repo: 'owner/repo', file: 'model.Q4_K_M.gguf' },
        plan_digest: 'unknown',
        request_id: 'r',
      })
    ).rejects.toThrow('models.plan')
  })
})
