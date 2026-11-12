import { afterEach, expect, it, vi } from 'vitest'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { FastFlowLmRegistry } from '@atomic-chat/core/models'
import { parseAtomicModelCatalog } from '@atomic-chat/core/client'
import { HASH_MISMATCH_MESSAGE } from '../../src/downloads/index.js'
import { WorkspaceService } from '../../src/workspace-service/index.js'
import { flmFixture } from '../helpers/fastflowlm.js'
const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
})
async function fixture() {
  const f = await flmFixture()
  cleanups.push(f.cleanup)
  return f
}
type Plan = { digest: string; catalog_digest: string }
const planFor = (f: Awaited<ReturnType<typeof fixture>>) =>
  f.service.execute('fastflowlm.plan', { model: f.definition.model_id, refresh: true }) as Promise<Plan>
async function waitJob(service: WorkspaceService, id: string, stage: string) {
  return vi.waitFor(
    async () => {
      const job = (await service.snapshot()).setups.find((v) => (v as { id?: string }).id === id) as
        { stage: string; error?: string } | undefined
      expect(job?.stage).toBe(stage)
      return job
    },
    // A job can still be restoring files while Windows retries a rename for up to 10 seconds.
    { timeout: 20_000, interval: 100 }
  )
}
async function install(f: Awaited<ReturnType<typeof fixture>>, id = 'first') {
  const p = await planFor(f)
  await f.service.execute('fastflowlm.install', { request_id: id, plan_digest: p.digest })
  await waitJob(f.service, id, 'ready')
  return p
}
it.each(['config.json', 'model.q4nx'])(
  'rejects a wrong SHA for %s without publishing a completion marker',
  async (file) => {
    const f = await fixture()
    // The production baseline also includes Qwen; select only this synthetic download plan.
    f.definition.model_id = 'fixture-sha-qwen3'
    f.definition.variant_id = 'fixture-sha-qwen3-npu2'
    f.catalog.models.fixture.variants = { [f.definition.variant_id]: {} }
    f.catalog.collections['fastflowlm-models'].entries[0]!.variant = f.definition.variant_id
    parseAtomicModelCatalog(f.catalog)
    await f.save()
    const p = await planFor(f)
    f.bytes.set(file, Buffer.alloc(f.bytes.get(file)!.length, 33))
    await f.service.execute('fastflowlm.install', { request_id: 'broken', plan_digest: p.digest })
    await waitJob(f.service, 'broken', 'failed')
    expect(
      (await f.service.snapshot()).setups.find((job) => (job as { id?: string }).id === 'broken')
    ).toMatchObject({
      error: HASH_MISMATCH_MESSAGE,
    })
    expect(await new FastFlowLmRegistry(f.paths.layout).list()).toEqual([])
    expect(f.link.calls.some((c) => c.path === '/models/fastflowlm/maintenance')).toBe(false)
  }
)
it('refuses a full disk before download and preserves an installed model', async () => {
  const f = await fixture()
  const before = await install(f)
  f.definition.sources[0]!.revision = 'b'.repeat(40)
  await f.save()
  f.link.disk.available = async () => 0
  const p = await planFor(f)
  await expect(
    f.service.execute('fastflowlm.install', { request_id: 'full', plan_digest: p.digest })
  ).rejects.toThrow('free space')
  expect(
    (await new FastFlowLmRegistry(f.paths.layout).get(f.definition.variant_id)).yml.fastflowlm.catalog_digest
  ).toBe(before.catalog_digest)
})
it('rolls back a verified replacement when the owner rejects its final check', async () => {
  const f = await fixture()
  const before = await install(f)
  f.definition.sources[0]!.revision = 'b'.repeat(40)
  await f.save()
  f.link.responses['POST /models/fastflowlm/check'] = (body: { model_id?: string }) => ({
    verdict: body.model_id ? 'environment-not-ready' : 'ok',
    reason: 'fixture rejection',
  })
  const p = await planFor(f)
  await f.service.execute('fastflowlm.install', { request_id: 'replacement', plan_digest: p.digest })
  const failed = await waitJob(f.service, 'replacement', 'failed')
  expect(failed?.error).toBe('fixture rejection')
  expect(
    (await new FastFlowLmRegistry(f.paths.layout).get(f.definition.variant_id)).yml.fastflowlm.catalog_digest
  ).toBe(before.catalog_digest)
  expect(await readdir(join(f.paths.atcDir, 'fastflowlm-mutations'))).toEqual([])
})
it('releases an accepted mutation after a lost complete response without replacing the files again', async () => {
  const f = await fixture()
  f.link.responses['POST /models/fastflowlm/maintenance/maintenance-1/complete'] = new Error('lost response')
  const p = await planFor(f)
  await f.service.execute('fastflowlm.install', { request_id: 'lost', plan_digest: p.digest })
  await waitJob(f.service, 'lost', 'failed')
  f.link.responses['POST /models/fastflowlm/maintenance'] = {
    operation_id: 'maintenance-1',
    ready_to_mutate: false,
  }
  f.link.responses['GET /models/fastflowlm/maintenance/maintenance-1'] = { state: 'completed' }
  const restarted = new WorkspaceService(f.options)
  await restarted.start()
  restarted.stop()
  expect(await readdir(join(f.paths.atcDir, 'fastflowlm-mutations'))).toEqual([])
  expect(
    (await new FastFlowLmRegistry(f.paths.layout).get(f.definition.variant_id)).yml.fastflowlm.catalog_digest
  ).toBe(p.catalog_digest)
})
it.each(['before-rename', 'after-backup', 'after-publish'])(
  'recovers a durable replacement %s under the same maintenance request',
  async (phase) => {
    const f = await fixture()
    const p = await install(f)
    const model = f.definition.variant_id,
      target = join(f.paths.layout.provider('fastflowlm').modelsDir, model)
    const backup = join(f.paths.dataFolder, 'fastflowlm', 'recovery', model)
    const stage = join(f.paths.dataFolder, 'fastflowlm', 'transfers', p.digest, 'fastflowlm', 'models', model)
    // Use a distinct digest to force replacement even though the fixture bytes remain the same.
    const { cp } = await import('node:fs/promises')
    await mkdir(join(stage, '..'), { recursive: true })
    await cp(target, stage, { recursive: true })
    const marker = join(stage, 'model.yml')
    await writeFile(marker, (await readFile(marker, 'utf8')).replaceAll(p.catalog_digest, 'f'.repeat(64)))
    const mutation = {
      model,
      kind: 'replace',
      request_id: 'recover-me',
      digest: 'f'.repeat(64),
      stage,
      had_previous: true,
      accepted: false,
    }
    await mkdir(join(backup, '..'), { recursive: true })
    if (phase !== 'before-rename') await rename(target, backup)
    if (phase === 'after-publish') await rename(stage, target)
    await writeFile(join(f.paths.atcDir, 'fastflowlm-mutations', model + '.json'), JSON.stringify(mutation))
    const restarted = new WorkspaceService(f.options)
    await restarted.start()
    restarted.stop()
    expect((await new FastFlowLmRegistry(f.paths.layout).get(model)).yml.fastflowlm.catalog_digest).toBe(
      mutation.digest
    )
    expect(
      f.link.calls.filter((c) => c.path === '/models/fastflowlm/maintenance').at(-1)?.body
    ).toMatchObject({ request_id: 'recover-me' })
  }
)
it('strips gated credentials from a redirected model download', async () => {
  const f = await fixture()
  f.definition.gated = true
  await f.save()
  const calls: { url: string; auth: string | null }[] = []
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    calls.push({ url: url.href, auth: new Headers(init?.headers).get('authorization') })
    if (url.hostname === 'huggingface.co')
      return new Response(null, {
        status: 302,
        headers: { location: 'https://cdn.test/' + url.pathname.split('/').at(-1) },
      })
    const bytes = f.bytes.get(url.pathname.slice(1))!
    return new Response(new Uint8Array(bytes), { headers: { 'content-length': String(bytes.length) } })
  }
  f.service = new WorkspaceService({
    ...f.options,
    fetch: request,
    env: { ...f.options.env, HF_TOKEN: 'fixture-secret' },
  })
  await install(f)
  expect(calls.some((c) => c.auth === 'Bearer fixture-secret')).toBe(true)
  expect(calls.filter((c) => c.url.startsWith('https://cdn.test')).every((c) => c.auth === null)).toBe(true)
})
it('resumes partial bytes and the same pinned job after a server restart', async () => {
  const f = await fixture(),
    p = await planFor(f)
  const answer = f.request.getMockImplementation()!
  let waiting = false
  f.request.mockImplementation(async (input, init) => {
    if (String(input).endsWith('/config.json')) return answer(input)
    waiting = true
    return new Promise<Response>((_, reject) =>
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true })
    )
  })
  await f.service.execute('fastflowlm.install', { request_id: 'resume', plan_digest: p.digest })
  await vi.waitFor(
    async () => {
      expect(waiting).toBe(true)
      const config = join(
        f.paths.dataFolder,
        'fastflowlm',
        'transfers',
        p.digest,
        'fastflowlm',
        'models',
        f.definition.variant_id,
        'config.json.tmp'
      )
      expect(await readFile(config)).toEqual(f.bytes.get('config.json'))
    },
    { timeout: 3000 }
  )
  await f.service.execute('fastflowlm.cancel', { id: 'resume' })
  expect(await new FastFlowLmRegistry(f.paths.layout).list()).toEqual([])
  f.request.mockImplementation(answer)
  const prior = f.request.mock.calls.length
  const restarted = new WorkspaceService(f.options)
  await restarted.execute('fastflowlm.install', { request_id: 'resume', plan_digest: p.digest })
  await waitJob(restarted, 'resume', 'ready')
  expect(f.request.mock.calls.slice(prior).some(([url]) => String(url).endsWith('/config.json'))).toBe(false)
})
