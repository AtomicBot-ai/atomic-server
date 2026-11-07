import { afterEach, expect, it, vi } from 'vitest'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { EngineSelection } from '../../terminal-setup/index.js'
import { EngineDownloads } from './engine-downloads.js'

const cleanups: Array<() => void> = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))
function fixture() {
  const tmp = tmpDataFolder()
  cleanups.push(tmp.cleanup)
  const link = fakeCoreLink()
  const target = { version: 'flm-1.0.11-r2', variant: 'linux-x64-npu' }
  const entry = { engine: 'fastflowlm', latest: target, active: null as typeof target | null }
  link.responses['POST /engines/versions'] = { engines: [entry] }
  link.responses['POST /engines/fastflowlm/update'] = (body: Record<string, unknown>) => {
    if ('target' in body) throw new Error('The core picks the fastflowlm build; an update takes no target.')
    entry.active = target
    return {}
  }
  link.responses['POST /engine-builds/fastflowlm/catalog'] = () => ({ active: entry.active })
  link.responses['GET /backends/fastflowlm'] = new Error('FLM has no llama.cpp backends route.')
  const queue = new EngineDownloads(tmp.paths.atcDir, link)
  return { tmp, link, target, queue }
}

it('installs the selected FLM through core choice and later reuses it for model setup', async () => {
  const { tmp, link, target, queue } = fixture()
  const job = await queue.enqueue('fastflowlm', { target, select: true })
  await vi.waitFor(async () => expect((await queue.list())[0]?.stage).toBe('ready'))
  expect(link.calls.find((call) => call.path === '/engines/fastflowlm/update')?.body).toEqual({
    task_id: job.id,
  })
  expect(await new EngineSelection(tmp.paths.atcDir, async () => link).read()).toBe(
    'fastflowlm|flm-1.0.11-r2|linux-x64-npu'
  )
  await queue.ensure('fastflowlm', 'model-setup', target)
  expect(link.calls.filter((call) => call.path.endsWith('/update'))).toHaveLength(1)
  expect(link.calls.some((call) => call.path.startsWith('/backends/'))).toBe(false)
})

it('retries a persisted FLM job carrying its onboarding target after a server restart', async () => {
  const { tmp, link, target, queue } = fixture()
  const update = link.responses['POST /engines/fastflowlm/update']
  link.responses['POST /engines/fastflowlm/update'] = new Error('Previous installation failed')
  const job = await queue.enqueue('fastflowlm', { target, select: true })
  await vi.waitFor(async () => expect((await queue.list())[0]?.stage).toBe('failed'))
  link.responses['POST /engines/fastflowlm/update'] = update!
  const restarted = new EngineDownloads(tmp.paths.atcDir, link)
  await restarted.retry(job.id)
  await vi.waitFor(async () =>
    expect((await restarted.list())[0]).toMatchObject({ id: job.id, stage: 'ready' })
  )
  expect(link.calls.at(-2)?.body).not.toHaveProperty('target')
})

it('shares one core-chosen install between explicit onboarding and untargeted admin requests', async () => {
  const { link, target, queue } = fixture()
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  const update = link.responses['POST /engines/fastflowlm/update'] as (body: unknown) => unknown
  link.responses['POST /engines/fastflowlm/update'] = async (body: unknown) => {
    await waiting
    return update(body)
  }
  try {
    const first = await queue.enqueue('fastflowlm', { target })
    const second = await queue.enqueue('fastflowlm')
    expect(second.id).toBe(first.id)
    await vi.waitFor(() => expect(link.calls.some((call) => call.path.endsWith('/update'))).toBe(true))
  } finally {
    release()
    await vi.waitFor(async () =>
      expect((await queue.list()).every((job) => job.stage === 'ready')).toBe(true)
    )
  }
  expect(link.calls.filter((call) => call.path.endsWith('/update'))).toHaveLength(1)
})
