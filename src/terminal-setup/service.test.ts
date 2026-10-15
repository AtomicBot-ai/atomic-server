import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { TerminalSetup } from './service.js'
import type { ModelSetup, ModelSetupPlan } from './types.js'
const plan: ModelSetupPlan = {
  digest: 'reviewed',
  model_id: 'owner/model',
  provider: 'llamacpp-upstream',
  verdict: { status: 'supported' } as never,
  engine: null,
  model: { repo: 'owner/repo', file: 'model.gguf', revision: 'pinned', size: 1000 },
  projector: null,
  total_download_bytes: 1000,
  free_bytes: 10000000000,
  blockers: [],
}
it.each(['llamacpp-upstream', 'llamacpp'])(
  'gates entry, resumes idempotently and loads the selected %s engine',
  async (provider) => {
    const folder = await mkdtemp(join(tmpdir(), 'atc-setup-')),
      link = fakeCoreLink()
    const jobs: ModelSetup[] = [],
      packs: { version: string; backend: string }[] = []
    link.request = async <T>(method: string, path: string, body?: unknown) => {
      link.calls.push({ method, path, body })
      if (path === '/models/setup-plan') return plan as T
      if (path === `/backends/${provider}`) return { backends: packs } as T
      if (path.endsWith('/install')) {
        packs.push({ version: 'b1', backend: 'cpu' })
        return {} as T
      }
      if (path === '/model-setups' && method === 'POST') {
        const input = body as { request_id: string }
        const record = {
          setup_id: 'one',
          request_id: input.request_id,
          stage: 'downloading_model',
          plan,
          task_ids: { model: 'model-transfer' },
        } as ModelSetup
        jobs.push(record)
        return record as T
      }
      if (path === '/model-setups') return { setups: jobs } as T
      return {} as T
    }
    try {
      const service = new TerminalSetup(folder, async () => link)
      const selected = await service.plan({ repo: 'owner/repo', file: 'model.gguf' })
      await service.begin('server', `${provider}|b1|cpu`, [selected])
      await expect(service.finish()).rejects.toThrow('every selected')
      const reopened = new TerminalSetup(folder, async () => link)
      await reopened.begin('server', `${provider}|b1|cpu`, [{ ...selected, requestId: 'retry-with-new-id' }])
      expect(jobs).toHaveLength(1)
      link.snapshotValue.downloads = [
        { taskId: 'model-transfer', transferred: 500, total: 1000, percent: 50 },
      ]
      expect((await reopened.progress()).transfers[0]?.percent).toBe(50)
      jobs[0]!.stage = 'ready'
      expect((await reopened.progress()).ready).toBe(true)
      await reopened.finish()
      expect((await reopened.read())?.complete).toBe(true)
      expect(link.calls).toContainEqual(
        expect.objectContaining({ path: `/models/${provider}/owner/model/load` })
      )
      expect(link.calls).not.toContainEqual(expect.objectContaining({ path: '/server/start' }))
      await reopened.begin('server', `${provider}|b1|cpu`, [{ ...selected, requestId: 'additional-install' }])
      expect(await new TerminalSetup(folder, async () => link).read()).toMatchObject({
        complete: false,
        onboarded: true,
      })
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  }
)
it('refuses insufficient space before starting transfers', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'atc-setup-disk-')),
    link = fakeCoreLink()
  link.disk.available = async () => 50
  try {
    const service = new TerminalSetup(folder, async () => link)
    await expect(
      service.begin('server', 'llamacpp-upstream|b1|cpu', [
        { plan, request: { repo: 'owner/repo', file: 'model.gguf' }, requestId: 'one' },
      ])
    ).rejects.toThrow('disk space')
    expect(link.calls).toEqual([])
    expect(await service.read()).toBeNull()
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})

it('requests every installable GGUF engine from the shared live advisor', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'atc-engines-')),
    link = fakeCoreLink()
  link.request = async <T>(_method: string, path: string) => {
    link.calls.push({ method: 'POST', path })
    return { provider: path.split('/')[2], available: [{ version: 'v1', backend: 'cpu' }] } as T
  }
  try {
    const service = new TerminalSetup(folder, async () => link)
    expect((await service.catalogs()).map((c) => c.provider)).toEqual([
      'llamacpp-upstream',
      'llamacpp',
      'atomic-prism',
    ])
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})

it('reports why the engine check failed when every catalog request fails', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'atc-engines-')),
    link = fakeCoreLink()
  link.request = async () => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:53890')
  }
  try {
    const service = new TerminalSetup(folder, async () => link)
    await expect(service.catalogs()).rejects.toThrow('ECONNREFUSED')
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})
