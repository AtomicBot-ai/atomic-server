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
function workspace() {
  const jobs: ModelSetup[] = []
  const calls: Array<{ name: string; input: Record<string, unknown> }> = []
  const downloads: unknown[] = []
  const ws: SetupWorkspace = {
    execute: async (name, input = {}) => {
      calls.push({ name, input })
      if (name === 'models.plan') return { ...plan, digest: `fresh-${String(input['file'])}` }
      if (name === 'setup.status') return { setups: jobs }
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
      w = workspace()
    const packs: { version: string; backend: string }[] = []
    link.request = async <T>(method: string, path: string, body?: unknown) => {
      link.calls.push({ method, path, body })
      if (path === `/backends/${provider}`) return { backends: packs } as T
      if (path.endsWith('/install')) packs.push({ version: 'b1', backend: 'cpu' })
      return {} as T
    }
    const service = new TerminalSetup(dir, async () => link, w.ws)
    const selected = await service.plan({ repo: 'owner/repo', file: 'model.gguf' })
    await service.begin('server', `${provider}|b1|cpu`, [selected])
    await expect(service.finish()).rejects.toThrow('every selected')
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
  }
)

it('leaves the PrismML build to the setup record, and pause cancels the setups and that build download', async () => {
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
  expect(link.calls.filter((c) => c.path.startsWith('/downloads/')).map((c) => c.path)).toEqual([
    '/downloads/atomic-prism-backend-prism-b3-abcdef0-cpu/cancel',
  ])
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
    return { provider: path.split('/')[2], available: [{ version: 'v1', backend: 'cpu' }] } as T
  }
  const service = new TerminalSetup(await folder(), async () => link, workspace().ws)
  expect((await service.catalogs()).map((c) => c.provider)).toEqual([
    'llamacpp-upstream',
    'llamacpp',
    'atomic-prism',
  ])
})
