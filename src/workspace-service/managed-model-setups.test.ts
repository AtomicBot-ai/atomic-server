import { AtomicCoreError } from '@atomic-chat/core'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Downloader } from '../downloads/index.js'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import type { FakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { FixtureHttpServer } from '../../test/helpers/fixture-http-server.js'
import { HF_SHA, qwenFiles, serveRepository } from '../../test/helpers/hf-hub.js'
import { waitFor } from '../../test/helpers/wait-for.js'
import type { ManagedModelJob } from '../contract/index.js'
import { ManagedModelSetups } from './managed-model-setups.js'
import type { StoreFiles } from './managed-model-setups.js'

const server = new FixtureHttpServer()
const scratch = mkdtempSync(join(tmpdir(), 'atc-mms-'))
let hub: string
beforeAll(async () => {
  hub = await server.start()
})
afterAll(async () => {
  server.release()
  await server.stop()
  rmSync(scratch, { recursive: true, force: true })
})
beforeEach(() => server.reset())

const REPO = 'Qwen/Qwen3.5-2B'
const ok = {
  architectures: ['Qwen3ForCausalLM'],
  quantization_format: null,
  weight_bytes: 6144,
  checked_gpu_id: 'GPU-0',
  curated: false,
  unified_memory: false,
  fits_other_gpus: [],
  verdict: { ok: true },
}
let n = 0

/** A core that registers vLLM, accepts the model, and names `root` as the store. */
function core(root: string, over: Record<string, unknown> = {}): FakeCoreLink {
  const l = fakeCoreLink()
  l.responses['POST /engines/versions'] = { engines: [{ engine: 'vllm' }, { engine: 'tensorrt-llm' }] }
  l.responses['GET /environments'] = { environments: [] }
  l.responses['POST /models/vllm/check'] = ok
  l.responses['GET /managed-models/location'] = { root, free_bytes: 10 * 1024 ** 3 }
  l.responses[`GET /models/vllm/${REPO}/capabilities`] = { model_id: REPO }
  Object.assign(l.responses, over)
  return l
}

function setups(
  l: FakeCoreLink,
  root: string,
  extra: Partial<ConstructorParameters<typeof ManagedModelSetups>[0]> = {}
) {
  const dataFolder = join(scratch, `data-${n}`)
  return new ManagedModelSetups({
    link: l,
    fetch,
    env: { HF_ENDPOINT: hub },
    directory: join(dataFolder, 'atc', 'managed-model-setups'),
    downloader: new Downloader({
      dataFolder,
      platform: process.platform,
      fetch,
      streams: 1,
      availableSpace: async () => undefined,
      sleep: async () => {},
    }),
    ...extra,
  })
}

const settled = async (s: ManagedModelSetups, id: string): Promise<ManagedModelJob> => {
  let job: ManagedModelJob | undefined
  await waitFor(async () => {
    job = (await s.list()).find((j) => j.id === id)
    return !!job && ['ready', 'failed', 'cancelled'].includes(job.stage)
  })
  return job!
}

beforeEach(() => {
  n += 1
})

describe('ManagedModelSetups', () => {
  it('downloads every file of the pinned revision into <root>/<repo>/, then model.yml, then sees the core list it', async () => {
    const files = serveRepository(server, REPO, qwenFiles())
    const root = join(scratch, `store-${n}`)
    const l = core(root)
    const s = setups(l, root)
    const plan = await s.plan({ repository: REPO, engine: 'vllm' })
    expect(plan).toMatchObject({
      repository: REPO,
      revision: HF_SHA,
      engine: 'vllm',
      root,
      present: false,
      blockers: [],
    })
    expect(plan.pending).toHaveLength(files.length)
    const job = await settled(s, (await s.install({ request_id: 'r1', plan_digest: plan.digest })).id)
    expect(job.stage).toBe('ready')
    const dir = join(root, 'Qwen', 'Qwen3.5-2B')
    expect((await readdir(dir)).sort()).toEqual([...Object.keys(qwenFiles()), 'model.yml'].sort())
    const yml = JSON.parse(await readFile(join(dir, 'model.yml'), 'utf8'))
    expect(yml).toEqual({
      repository: REPO,
      revision: HF_SHA,
      architectures: ['Qwen3ForCausalLM'],
      files: plan.files,
    })
    // Last: every weight was there before the file that makes the folder a model.
    const written = await Promise.all(
      ['model.yml', 'model-00002-of-00002.safetensors'].map((f) => stat(join(dir, f)))
    )
    expect(written[0]!.mtimeMs).toBeGreaterThanOrEqual(written[1]!.mtimeMs)
    expect(l.calls.some((c) => c.path === `/models/vllm/${REPO}/capabilities`)).toBe(true)
  })

  it('refuses before any download when the engine does not accept the model', async () => {
    serveRepository(server, REPO, qwenFiles())
    const root = join(scratch, `store-${n}`)
    const l = core(root, {
      'POST /models/vllm/check': {
        ...ok,
        verdict: { ok: false, error: { code: 'MODEL_INCOMPATIBLE', message: 'Needs 24 GiB.' } },
      },
    })
    const s = setups(l, root)
    const plan = await s.plan({ repository: REPO, engine: 'vllm' })
    expect(plan.blockers).toEqual(['vllm: Needs 24 GiB.'])
    await expect(s.install({ request_id: 'r2', plan_digest: plan.digest })).rejects.toThrow('Needs 24 GiB.')
    expect(
      server.requests.some((r) => r.path.endsWith('.safetensors') && !r.range?.startsWith('bytes=0-'))
    ).toBe(false)
  })

  it('refuses when the store has less room than the files, by the core’s own number', async () => {
    serveRepository(server, REPO, qwenFiles())
    const root = join(scratch, `store-${n}`)
    const s = setups(core(root, { 'GET /managed-models/location': { root, free_bytes: 100 } }), root)
    const plan = await s.plan({ repository: REPO, engine: 'vllm' })
    expect(plan.blockers[0]).toContain('free')
  })

  it('says to install the engine first when the core has no store yet', async () => {
    serveRepository(server, REPO, qwenFiles())
    const root = join(scratch, `store-${n}`)
    const s = setups(
      core(root, {
        'GET /managed-models/location': new AtomicCoreError(
          'MANAGED_ADAPTER_UNAVAILABLE',
          'No distribution yet.'
        ),
      }),
      root
    )
    await expect(s.plan({ repository: REPO, engine: 'tensorrt-llm' })).rejects.toMatchObject({
      hint: expect.stringContaining('atc engines install tensorrt-llm'),
    })
  })

  it('is interrupted by a restart without model.yml, and the same request id resumes and finishes it', async () => {
    serveRepository(server, REPO, qwenFiles())
    const root = join(scratch, `store-${n}`)
    const l = core(root)
    const first = setups(l, root)
    const plan = await first.plan({ repository: REPO, engine: 'vllm' })
    server.files.get(`/${REPO}/resolve/${HF_SHA}/model-00001-of-00002.safetensors`)!.holdAfterBytes = 100
    await first.install({ request_id: 'r3', plan_digest: plan.digest })
    const partial = join(root, 'Qwen', 'Qwen3.5-2B', 'model-00001-of-00002.safetensors.tmp')
    await waitFor(async () => ((await stat(partial).catch(() => null))?.size ?? 0) >= 100)
    // The server stops mid-transfer: its worker is gone and the record still says `downloading`.
    await first.cancel('r3')
    await waitFor(() => (first as unknown as { running: Map<string, unknown> }).running.size === 0)
    const record = join(first.directory, 'r3.json')
    await writeFile(
      record,
      JSON.stringify({ ...JSON.parse(await readFile(record, 'utf8')), stage: 'downloading' })
    )
    server.release()
    delete server.files.get(`/${REPO}/resolve/${HF_SHA}/model-00001-of-00002.safetensors`)!.holdAfterBytes
    const second = setups(l, root, { directory: first.directory })
    expect((await second.list()).find((j) => j.id === 'r3')?.stage).toBe('interrupted')
    expect(await readdir(join(root, 'Qwen', 'Qwen3.5-2B'))).not.toContain('model.yml')
    server.requests.length = 0
    const resumed = await settled(
      second,
      (await second.install({ request_id: 'r3', plan_digest: plan.digest })).id
    )
    expect(resumed.stage).toBe('ready')
    // The partial was continued from where it stopped, not fetched again.
    const continued = server.requests.find((r) => r.path.endsWith('model-00001-of-00002.safetensors'))
    expect(continued?.range).toMatch(/^bytes=[1-9]\d*-$/)
  })

  it('cancels, keeping the partial files and writing no model.yml', async () => {
    serveRepository(server, REPO, qwenFiles())
    const root = join(scratch, `store-${n}`)
    const s = setups(core(root), root)
    const plan = await s.plan({ repository: REPO, engine: 'vllm' })
    server.files.get(`/${REPO}/resolve/${HF_SHA}/model-00001-of-00002.safetensors`)!.holdAfterBytes = 100
    await s.install({ request_id: 'r4', plan_digest: plan.digest })
    await waitFor(async () => (await s.list()).find((j) => j.id === 'r4')?.stage === 'downloading')
    await s.cancel('r4')
    expect((await settled(s, 'r4')).stage).toBe('cancelled')
    server.release()
    const dir = join(root, 'Qwen', 'Qwen3.5-2B')
    expect(await readdir(dir)).not.toContain('model.yml')
  })

  it('downloads nothing for a revision already in the store', async () => {
    serveRepository(server, REPO, qwenFiles())
    const root = join(scratch, `store-${n}`)
    const s = setups(core(root), root)
    const plan = await s.plan({ repository: REPO, engine: 'vllm' })
    await settled(s, (await s.install({ request_id: 'r5', plan_digest: plan.digest })).id)
    const again = await s.plan({ repository: REPO, engine: 'vllm' })
    expect(again).toMatchObject({ present: true, pending: [], download_bytes: 0 })
    server.requests.length = 0
    expect(
      (await settled(s, (await s.install({ request_id: 'r6', plan_digest: again.digest })).id)).stage
    ).toBe('ready')
    expect(server.requests).toEqual([])
  })

  it('fails, leaving the files, when the core does not list the model after model.yml', async () => {
    serveRepository(server, REPO, qwenFiles())
    const root = join(scratch, `store-${n}`)
    const s = setups(
      core(root, {
        [`GET /models/vllm/${REPO}/capabilities`]: new AtomicCoreError('MODEL_NOT_FOUND', 'No such model.'),
      }),
      root
    )
    const plan = await s.plan({ repository: REPO, engine: 'vllm' })
    const job = await settled(s, (await s.install({ request_id: 'r7', plan_digest: plan.digest })).id)
    expect(job.stage).toBe('failed')
    expect(job.error).toContain('does not list')
    expect(await readdir(join(root, 'Qwen', 'Qwen3.5-2B'))).toContain('model.yml')
  })

  it('writes into the store the core names on Windows, with its own separators', async () => {
    serveRepository(server, REPO, qwenFiles())
    const root = '\\\\wsl.localhost\\AtomicChat\\var\\lib\\atomic-chat\\models'
    const saved: string[] = []
    const roots: string[][] = []
    const writes: string[] = []
    const files: StoreFiles = {
      size: async () => null,
      readText: async () => undefined,
      writeAtomic: async (path) => {
        writes.push(path)
      },
    }
    const s = setups(core(root), root, {
      files,
      downloader: {
        download: async (_id, items, options) => {
          saved.push(...items.map((i) => i.save_path))
          roots.push(options?.allowedRoots ?? [])
        },
        cancel: () => true,
      },
    })
    const plan = await s.plan({ repository: REPO, engine: 'vllm' })
    expect(
      (await settled(s, (await s.install({ request_id: 'r8', plan_digest: plan.digest })).id)).stage
    ).toBe('ready')
    expect(saved).toContain(`${root}\\Qwen\\Qwen3.5-2B\\model-00001-of-00002.safetensors`)
    expect(roots).toEqual([[root]])
    expect(writes).toEqual([`${root}\\Qwen\\Qwen3.5-2B\\model.yml`])
  })
})
