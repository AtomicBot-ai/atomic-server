import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { writeDocument } from '../terminal-data/index.js'
import { TerminalSetup } from './service.js'
import type { SetupWorkspace } from './service.js'
import type { ModelSetup, ModelSetupPlan } from './types.js'

const plan: ModelSetupPlan = {
  digest: 'reviewed',
  model_id: 'owner/model',
  provider: 'llamacpp-upstream',
  verdict: { outcome: 'compatible' } as never,
  engine: null,
  model: { repo: 'owner/repo', file: 'model.gguf', revision: 'pinned', size: 1000 },
  projector: null,
  total_download_bytes: 1000,
  free_bytes: 10000000000,
  blockers: [],
}
const folders: string[] = []
afterEach(async () => {
  for (const f of folders.splice(0)) await rm(f, { recursive: true, force: true })
})

/** The server's workspace: plans, atc-owned setup records and the downloads snapshot. */
function workspace(onEngine: () => void = () => {}) {
  const jobs: ModelSetup[] = []
  const calls: Array<{ name: string; input: Record<string, unknown> }> = []
  const downloads: unknown[] = []
  const ws: SetupWorkspace = {
    execute: async (name, input = {}) => {
      calls.push({ name, input })
      if (name === 'models.plan') return { ...plan, digest: `fresh-${String(input['file'])}` }
      if (name === 'setup.status') return { setups: jobs }
      if (name === 'engines.enqueue') onEngine()
      if (name === 'models.install') {
        const record = {
          setup_id: `setup-${jobs.length + 1}`,
          request_id: input['request_id'],
          stage: 'downloading_model',
          plan,
          task_ids: { model: 'model-transfer' },
        } as unknown as ModelSetup
        jobs.push(record)
        return record
      }
      return {}
    },
    snapshot: async () => ({ downloads, setups: jobs }),
  }
  return { ws, jobs, calls, downloads }
}
async function folder() {
  const path = await mkdtemp(join(tmpdir(), 'atc-setup-'))
  folders.push(path)
  return path
}

it.each(['llamacpp-upstream', 'llamacpp'])(
  'installs through the workspace, resumes idempotently and loads the selected %s engine',
  async (provider) => {
    const dir = await folder(),
      link = fakeCoreLink(),
      packs: { version: string; backend: string }[] = [],
      w = workspace(() => packs.push({ version: 'b1', backend: 'cpu' }))
    link.request = async <T>(method: string, path: string, body?: unknown) => {
      link.calls.push({ method, path, body })
      if (path === `/backends/${provider}`) return { backends: packs } as T
      return {} as T
    }
    const service = new TerminalSetup(dir, async () => link, w.ws)
    const selected = await service.plan({ repo: 'owner/repo', file: 'model.gguf' })
    await service.begin('server', `${provider}|b1|cpu`, [selected])
    await expect(service.finish()).rejects.toThrow('every selected')
    expect(w.calls).toContainEqual({
      name: 'engines.enqueue',
      input: { engine: provider, target: { version: 'b1', variant: 'cpu' } },
    })
    expect(link.calls.some((c) => c.path.endsWith('/install'))).toBe(false)
    expect(w.calls).toContainEqual({
      name: 'models.install',
      input: { request: selected.request, plan_digest: 'fresh-model.gguf', request_id: selected.requestId },
    })
    const reopened = new TerminalSetup(dir, async () => link, w.ws)
    await reopened.begin('server', `${provider}|b1|cpu`, [{ ...selected, requestId: 'retry-with-new-id' }])
    expect(w.jobs).toHaveLength(1)
    w.downloads.push({ taskId: 'model-transfer', transferred: 500, total: 1000, percent: 50 })
    expect((await reopened.progress()).transfers[0]?.percent).toBe(50)
    w.jobs[0]!.stage = 'ready'
    expect((await reopened.progress()).ready).toBe(true)
    await reopened.finish()
    expect((await reopened.read())?.complete).toBe(true)
    expect(link.calls).toContainEqual(
      expect.objectContaining({ path: `/models/${provider}/owner/model/load` })
    )
    expect(link.calls.some((c) => /model-setups|setup-plan/.test(c.path))).toBe(false)
    // The chosen build is made active by the core, never by a settings write.
    expect(link.calls).toContainEqual(
      expect.objectContaining({ method: 'POST', path: `/engines/${provider}/builds/b1/cpu/activate` })
    )
    expect(link.calls.some((c) => c.method === 'PATCH')).toBe(false)
  }
)

// A file re-uploaded to the Hub gets a new plan (size, hash): the fresh plan is installed, never the
// stale one again, which would fail the same way on every retry.
it('installs the fresh plan when the file changed since the earlier attempt', async () => {
  const dir = await folder(),
    link = fakeCoreLink(),
    w = workspace()
  link.responses['GET /backends/llamacpp-upstream'] = { backends: [{ version: 'b1', backend: 'cpu' }] }
  const service = new TerminalSetup(dir, async () => link, w.ws)
  const first = await service.plan({ repo: 'owner/repo', file: 'model.gguf' })
  await service.begin('server', 'llamacpp-upstream|b1|cpu', [first])
  w.jobs[0]!.stage = 'failed'
  const fresh = {
    ...first,
    requestId: 'after-reupload',
    plan: {
      ...first.plan,
      digest: 'changed-on-hub',
      model: { ...first.plan.model, size: 2000, sha256: 'f'.repeat(64) },
    },
  }
  await service.begin('server', 'llamacpp-upstream|b1|cpu', [fresh])
  expect(w.calls).toContainEqual({
    name: 'models.install',
    input: { request: fresh.request, plan_digest: 'changed-on-hub', request_id: 'after-reupload' },
  })
  expect(w.calls.some((c) => c.name === 'setup.resume')).toBe(false)
})

// What changed is the engine (installed by the first attempt), not the file: continue that setup.
it('continues the earlier setup when only its engine got installed since', async () => {
  const dir = await folder(),
    link = fakeCoreLink(),
    w = workspace()
  link.responses['GET /backends/llamacpp-upstream'] = { backends: [{ version: 'b1', backend: 'cpu' }] }
  const service = new TerminalSetup(dir, async () => link, w.ws)
  const first = await service.plan({ repo: 'owner/repo', file: 'model.gguf' })
  await service.begin('server', 'llamacpp-upstream|b1|cpu', [first])
  w.jobs[0]!.stage = 'failed'
  // A later commit to the repository (a README edit) moves the pinned revision, not the file's bytes.
  const replanned = {
    ...first,
    requestId: 'replanned',
    plan: {
      ...first.plan,
      digest: 'engine-now-installed',
      model: { ...first.plan.model, revision: 'next-commit' },
    },
  }
  await service.begin('server', 'llamacpp-upstream|b1|cpu', [replanned])
  expect(w.calls.filter((c) => c.name === 'models.install')).toHaveLength(1)
  expect(w.calls).toContainEqual({ name: 'setup.resume', input: { setup_id: 'setup-1' } })
})

it('leaves the PrismML build to the shared queue, and pauses only its model setup', async () => {
  const dir = await folder(),
    link = fakeCoreLink(),
    w = workspace()
  link.request = async <T>(method: string, path: string, body?: unknown) => {
    link.calls.push({ method, path, body })
    return (path.startsWith('/backends/') ? { backends: [] } : {}) as T
  }
  const service = new TerminalSetup(dir, async () => link, w.ws)
  await service.begin('server', 'atomic-prism|prism-b3-abcdef0|cpu', [
    await service.plan({ repo: 'o/r', file: 'm.gguf' }),
  ])
  expect(link.calls.some((c) => c.path.endsWith('/install'))).toBe(false)
  w.jobs[0]!.task_ids.engine = 'atomic-prism-backend-prism-b3-abcdef0-cpu'
  await service.pause()
  expect(w.calls).toContainEqual({ name: 'setup.cancel', input: { setup_id: 'setup-1' } })
  expect(link.calls.some((c) => c.path.startsWith('/downloads/'))).toBe(false)
})

it('shows an installation an earlier version started as one to start again, then restarts it', async () => {
  const dir = await folder(),
    link = fakeCoreLink(),
    w = workspace()
  link.request = async <T>(method: string, path: string, body?: unknown) => {
    link.calls.push({ method, path, body })
    return (path.startsWith('/backends/') ? { backends: [{ version: 'b1', backend: 'cpu' }] } : {}) as T
  }
  // Written by atc on core 0.13: the core ran setup `core-setup-1` for this request id.
  await writeDocument(join(dir, 'setup.json'), {
    version: 1,
    mode: 'server',
    startedAt: 1,
    complete: false,
    engine: { provider: 'llamacpp-upstream', version: 'b1', backend: 'cpu', taskId: 'terminal-engine-1' },
    selections: [
      {
        request: { repo: 'owner/repo', file: 'model.gguf', proxy: null },
        plan: { ...plan, digest: 'core-digest' },
        requestId: 'old-request',
      },
    ],
  })
  const service = new TerminalSetup(dir, async () => link, w.ws)
  expect(await service.progress()).toMatchObject({ restart: true, error: '', ready: false, jobs: [] })
  await service.resume()
  expect(w.calls).toContainEqual({ name: 'models.plan', input: { repo: 'owner/repo', file: 'model.gguf' } })
  expect(w.calls).toContainEqual({
    name: 'models.install',
    input: {
      request: { repo: 'owner/repo', file: 'model.gguf' },
      plan_digest: 'fresh-model.gguf',
      request_id: 'old-request',
    },
  })
  expect(await service.read()).toMatchObject({ version: 2 })
  expect((await service.progress()).restart).toBeUndefined()
})

it('refuses insufficient space before starting transfers', async () => {
  const dir = await folder(),
    link = fakeCoreLink(),
    w = workspace()
  link.disk.available = async () => 50
  const service = new TerminalSetup(dir, async () => link, w.ws)
  await expect(
    service.begin('server', 'llamacpp-upstream|b1|cpu', [
      { plan, request: { repo: 'owner/repo', file: 'model.gguf' }, requestId: 'one' },
    ])
  ).rejects.toThrow('disk space')
  expect(link.calls).toEqual([])
  expect(w.calls).toEqual([])
  expect(await service.read()).toBeNull()
})

it('requests every installable GGUF engine from the shared live advisor', async () => {
  const link = fakeCoreLink()
  link.request = async <T>(_method: string, path: string) => {
    link.calls.push({ method: 'POST', path })
    if (path === '/engines/versions')
      return { engines: ['llamacpp-upstream', 'llamacpp', 'atomic-prism'].map((engine) => ({ engine })) } as T
    return { provider: path.split('/')[2], available: [{ version: 'v1', backend: 'cpu' }] } as T
  }
  const service = new TerminalSetup(await folder(), async () => link, workspace().ws)
  expect((await service.catalogs()).map((c) => c.provider)).toEqual([
    'llamacpp-upstream',
    'llamacpp',
    'atomic-prism',
  ])
})

it('asks only the llama.cpp engines the core registers, and lists every registered engine in order', async () => {
  const link = fakeCoreLink()
  link.request = async <T>(method: string, path: string) => {
    link.calls.push({ method, path })
    if (path === '/engines/versions')
      return {
        engines: ['foundry-local', 'llamacpp-upstream', 'tensorrt-llm', 'vllm'].map((engine) => ({ engine })),
      } as T
    return { provider: path.split('/')[2], available: [{ version: 'v1', backend: 'cpu' }] } as T
  }
  const service = new TerminalSetup(await folder(), async () => link, workspace().ws)
  expect((await service.catalogs()).map((c) => c.provider)).toEqual(['llamacpp-upstream'])
  expect(
    link.calls.some((c) => c.path.includes('/backends/llamacpp/') || c.path.includes('atomic-prism'))
  ).toBe(false)
  expect(await service.engines()).toEqual(['llamacpp-upstream', 'vllm', 'tensorrt-llm', 'foundry-local'])
})
