import { afterEach, expect, it, vi } from 'vitest'
import { FastFlowLmRegistry } from '@atomic-chat/core/models'
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
it('uses the server catalog override and the core verdict without arbitrary Hub search', async () => {
  const f = await fixture()
  expect(await f.service.execute('models.search', { engine: 'fastflowlm' })).toMatchObject({
    list_error: null,
    models: [
      {
        model_id: f.definition.model_id,
        variants: [{ id: f.definition.variant_id, verdict: { verdict: 'ok' } }],
      },
    ],
  })
  expect(f.request).not.toHaveBeenCalled()
})
it('exposes NPU facts and the exact preparation plan through shared operations', async () => {
  const f = await fixture()
  expect(await f.service.execute('fastflowlm.accelerators')).toMatchObject({ ready: true })
  expect(await f.service.execute('fastflowlm.probe')).toMatchObject({
    runtime_account: 'fixture',
    status: 'ready',
  })
})
it('offers upstream entries without labelling them hardware-qualified', async () => {
  const f = await fixture()
  f.definition.qualification = {
    status: 'upstream',
    evidence: ['https://github.com/ROCm/FastFlowLM/blob/pinned/src/model_list.json'],
  }
  await f.save()
  const result = await f.service.execute('models.search', { engine: 'fastflowlm' })
  expect(result).toMatchObject({ models: [{ unverified: true, model_id: f.definition.model_id }] })
  expect(JSON.stringify(result)).not.toMatch(/"(?:recommended|suggested)":true/)
  expect(await f.service.execute('fastflowlm.plan', { model: f.definition.model_id })).toMatchObject({
    model_id: f.definition.model_id,
    blockers: [],
  })
})
it('puts conf recommendations first while keeping other FLM models available', async () => {
  const f = await fixture()
  const first = f.catalog.collections['fastflowlm-models'].entries[0]!
  const entry = structuredClone(f.catalog.models.fixture)
  entry.definition = { ...entry.definition, model_id: 'second', variant_id: 'second-npu2', recommended: true }
  entry.variants = { 'second-npu2': {} }
  Object.assign(f.catalog.models, { second: entry })
  f.catalog.collections['fastflowlm-models'].entries.push({
    ...first,
    model: 'second',
    variant: 'second-npu2',
  })
  await f.save()
  const result = (await f.service.execute('models.search', { engine: 'fastflowlm' })) as {
    models: { model_id: string; recommended: boolean; summary: string }[]
  }
  expect(result.models.map((m) => m.model_id)).toEqual(['second', f.definition.model_id])
  expect(result.models[0]).toMatchObject({
    recommended: true,
    summary: expect.stringContaining('Recommended'),
  })
  expect(result.models[1]).toMatchObject({ recommended: false })
})
it('executes the onboarding FLM queue and reports the actual core-selected build', async () => {
  const f = await fixture()
  const target = { version: 'flm-1.0.11-r2', variant: 'linux-x64-npu' }
  const active = { ...target, version: 'flm-1.0.11-r3' }
  let installed = false
  f.link.responses['POST /engines/versions'] = () => ({
    engines: [
      { engine: 'fastflowlm', kind: 'engine-build', latest: target, active: installed ? active : null },
    ],
  })
  f.link.responses['POST /engines/fastflowlm/update'] = (request: Record<string, unknown>) => {
    if ('target' in request) throw new Error('Core-owned engine installation takes no target.')
    installed = true
    return { active }
  }
  const job = (await f.service.execute('engines.enqueue', {
    engine: 'fastflowlm',
    target,
    select: true,
  })) as { id: string }
  await vi.waitFor(async () => {
    const snapshot = await f.service.snapshot()
    expect(snapshot.downloads).toContainEqual(expect.objectContaining({ id: job.id, stage: 'ready' }))
    expect(snapshot.selection?.engine).toBe('fastflowlm|flm-1.0.11-r3|linux-x64-npu')
  })
})
it('pins the plan across catalog drift and installs verified files using the server downloader', async () => {
  const f = await fixture()
  const plan = (await f.service.execute('fastflowlm.plan', { model: f.definition.model_id })) as {
    digest: string
  }
  f.definition.sources[0]!.revision = 'b'.repeat(40)
  await f.save()
  await f.service.execute('fastflowlm.install', { request_id: 'install', plan_digest: plan.digest })
  await vi.waitFor(async () => {
    const job = (await f.service.snapshot()).setups.find((v) => (v as { id?: string }).id === 'install') as {
      stage: string
      error?: string
    }
    if (job?.stage === 'failed') throw new Error(job.error)
    expect(job?.stage).toBe('ready')
  })
  const [installed] = await new FastFlowLmRegistry(f.paths.layout).list()
  expect(installed?.yml.fastflowlm.sources[0]?.revision).toBe('a'.repeat(40))
  expect(f.request.mock.calls.every(([url]) => String(url).includes('a'.repeat(40)))).toBe(true)
  await f.service.execute('models.remove', { model_id: f.definition.variant_id, store: 'fastflowlm' })
  expect(await new FastFlowLmRegistry(f.paths.layout).list()).toEqual([])
  expect(f.link.calls.some((c) => c.path === '/models/fastflowlm/maintenance')).toBe(true)
})
it('uses the selected variant license and gated requirements within one model family', async () => {
  const f = await fixture()
  const second = {
    ...structuredClone(f.definition),
    variant_id: 'qwen3-0.6b-gated',
    license: 'Second license',
    gated: true,
    context_length: 4096,
  }
  Object.assign(f.catalog.models, {
    second: {
      kind: 'fastflowlm',
      format: 'fastflowlm',
      definition: second,
      variants: { [second.variant_id]: {} },
    },
  })
  f.catalog.collections['fastflowlm-models'].entries.push({ model: 'second', variant: second.variant_id })
  await f.save()
  const gated = await f.service.execute('fastflowlm.plan', {
    model: f.definition.model_id,
    variant: second.variant_id,
  })
  expect(gated).toMatchObject({
    gated: true,
    license: 'Second license',
    context_length: 4096,
    blockers: [expect.stringContaining('HF_TOKEN')],
  })
  const open = await f.service.execute('fastflowlm.plan', {
    model: f.definition.model_id,
    variant: f.definition.variant_id,
  })
  expect(open).toMatchObject({ gated: false, license: 'fixture', blockers: [] })
})
