import { afterEach, expect, it, vi } from 'vitest'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../config/index.js'
import { EngineSelection } from '../terminal-setup/index.js'
import { downloadRows, inferenceReadiness } from '../workspace-view/index.js'
import { WorkspaceService } from './service.js'
import { EngineDownloads } from './engine-downloads.js'
const cleanups: Array<() => void> = []
afterEach(() => cleanups.splice(0).forEach((clean) => clean()))
function fixture() {
  const tmp = tmpDataFolder()
  cleanups.push(tmp.cleanup)
  const link = fakeCoreLink()
  link.responses['POST /engines/versions'] = {
    engines: ['llamacpp-upstream', 'atomic-prism'].map((engine) => ({
      engine,
      latest: { version: 'b1', variant: 'cpu' },
    })),
  }
  link.responses['GET /backends/atomic-prism'] = { backends: [] }
  const queue = new EngineDownloads(tmp.paths.atcDir, link)
  return { tmp, link, queue }
}
function held() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
it('owns sequential installs after enqueue returns, preserves progress and completed history', async () => {
  const { tmp, link, queue } = fixture(),
    first = held(),
    second = held()
  link.responses['POST /engines/llamacpp-upstream/update'] = () => first.promise
  link.responses['POST /engines/atomic-prism/update'] = () => second.promise
  const a = await queue.enqueue('llamacpp-upstream', { select: true })
  const b = await queue.enqueue('atomic-prism')
  expect(a).toMatchObject({ kind: 'engine', name: 'llama.cpp' })
  expect(b.stage).toBe('queued')
  await vi.waitFor(() => expect(link.calls.filter((c) => c.path.endsWith('/update'))).toHaveLength(1))
  queue.event('download:progress', { taskId: a.id, transferred: 30, total: 100 })
  expect(await new EngineSelection(tmp.paths.atcDir, async () => link).read()).toBe(
    'llamacpp-upstream|b1|cpu'
  )
  expect(await queue.list()).toMatchObject([
    { stage: 'downloading', transferred: 30, total: 100 },
    { stage: 'queued' },
  ])
  first.resolve()
  await vi.waitFor(() => expect(link.calls.filter((c) => c.path.endsWith('/update'))).toHaveLength(2))
  expect((await queue.list())[0]).toMatchObject({ stage: 'ready', transferred: 100, total: 100 })
  second.resolve()
  await vi.waitFor(async () => expect((await queue.list())[1]?.stage).toBe('ready'))
  const restored = await new EngineDownloads(tmp.paths.atcDir, link).list()
  expect(downloadRows([], restored)).toEqual([])
  expect(downloadRows([], restored, true)).toHaveLength(2)
})
it('deduplicates active requests and lets model setup join the chosen build without another install', async () => {
  const { link, queue } = fixture(),
    transfer = held()
  link.responses['POST /engines/atomic-prism/update'] = () => transfer.promise
  const a = await queue.enqueue('atomic-prism', { select: true })
  expect((await queue.enqueue('atomic-prism')).id).toBe(a.id)
  let finished = false
  const model = queue.ensure('atomic-prism', 'model-engine', { version: 'b1', variant: 'cpu' }).then(() => {
    finished = true
  })
  await vi.waitFor(() => expect(link.calls.filter((c) => c.path.endsWith('/update'))).toHaveLength(1))
  expect(finished).toBe(false)
  transfer.resolve()
  await model
  expect(finished).toBe(true)
  expect(link.calls.filter((c) => c.path.endsWith('/update'))).toHaveLength(1)
})
it('keeps a newer selection when an older queued engine finishes', async () => {
  const { tmp, link, queue } = fixture(),
    a = held(),
    b = held()
  link.responses['POST /engines/llamacpp-upstream/update'] = () => a.promise
  link.responses['POST /engines/atomic-prism/update'] = () => b.promise
  await queue.enqueue('llamacpp-upstream', { select: true })
  await queue.enqueue('atomic-prism', { select: true })
  a.resolve()
  await vi.waitFor(() => expect(link.calls.filter((c) => c.path.endsWith('/update'))).toHaveLength(2))
  expect(await new EngineSelection(tmp.paths.atcDir, async () => link).read()).toBe('atomic-prism|b1|cpu')
  b.resolve()
  await vi.waitFor(async () => expect((await queue.list())[1]?.stage).toBe('ready'))
})
it('retries failures without reporting ready early or leaking stored request metadata', async () => {
  const { tmp, link, queue } = fixture()
  link.responses['POST /engines/atomic-prism/update'] = new Error('Network unavailable')
  const row = await queue.enqueue('atomic-prism', {
    target: { version: 'b1', variant: 'cpu', secret: 'not-persisted' },
  })
  await vi.waitFor(async () => expect((await queue.list())[0]?.stage).toBe('failed'))
  expect(JSON.stringify(await new EngineDownloads(tmp.paths.atcDir, link).list())).not.toContain(
    'not-persisted'
  )
  const second = held()
  link.responses['POST /engines/atomic-prism/update'] = () => second.promise
  await queue.retry(row.id)
  expect((await queue.list())[0]?.stage).not.toBe('ready')
  second.resolve()
  await vi.waitFor(async () => expect((await queue.list())[0]?.stage).toBe('ready'))
})
it('marks abandoned server jobs interrupted; a new server never claims they are still downloading', async () => {
  const { tmp, link, queue } = fixture(),
    transfer = held()
  link.responses['POST /engines/atomic-prism/update'] = () => transfer.promise
  await queue.enqueue('atomic-prism')
  await vi.waitFor(() => expect(link.calls.some((c) => c.path.endsWith('/update'))).toBe(true))
  expect((await new EngineDownloads(tmp.paths.atcDir, link).list())[0]?.stage).toBe('interrupted')
  transfer.resolve()
  await vi.waitFor(async () => expect((await queue.list())[0]?.stage).toBe('ready'))
})
it('rejects managed consent bypass and invalid targets before any core install', async () => {
  const { link, queue } = fixture()
  await expect(queue.enqueue('vllm')).rejects.toThrow('review')
  await expect(
    queue.enqueue('atomic-prism', { target: { version: { token: 'x' }, variant: 'cpu' } })
  ).rejects.toThrow('version and variant')
  expect(link.calls).toEqual([])
})
it('shares queued progress with both frontend snapshots and gates inference until completion', async () => {
  const { tmp, link } = fixture(),
    transfer = held()
  link.responses['POST /engines/atomic-prism/update'] = () => transfer.promise
  const service = new WorkspaceService({ link, paths: tmp.paths, config: defaultConfig() })
  const job = (await service.execute('engines.enqueue', { engine: 'atomic-prism', select: true })) as {
    id: string
  }
  await vi.waitFor(() => expect(link.calls.some((c) => c.path.endsWith('/update'))).toBe(true))
  service.event('download:progress', { taskId: job.id, transferred: 20, total: 80 })
  const a = await service.snapshot(),
    b = await service.snapshot()
  expect(a.downloads).toEqual(b.downloads)
  expect(downloadRows(a.setups, a.downloads)).toMatchObject([{ kind: 'engine', transferred: 20, total: 80 }])
  expect(inferenceReadiness(a)).toMatchObject({ ready: false, waiting: true, acquire: 'downloads' })
  await expect(service.execute('api.start')).rejects.toThrow('engine is downloading')
  transfer.resolve()
  await vi.waitFor(async () => expect(downloadRows([], (await service.snapshot()).downloads)).toEqual([]))
})

it('waits for the selected queued version, not an older build of the same engine', async () => {
  const { link, queue } = fixture(),
    first = held(),
    second = held()
  let count = 0
  link.responses['POST /engines/atomic-prism/update'] = () => (++count === 1 ? first.promise : second.promise)
  await queue.enqueue('atomic-prism', { target: { version: 'b1', variant: 'cpu' } })
  await queue.enqueue('atomic-prism', { target: { version: 'b2', variant: 'cpu' }, select: true })
  let ready = false
  const load = queue.ensure('atomic-prism', 'load').then(() => {
    ready = true
  })
  first.resolve()
  await vi.waitFor(() => expect(count).toBe(2))
  expect(ready).toBe(false)
  second.resolve()
  await load
  expect(ready).toBe(true)
})
