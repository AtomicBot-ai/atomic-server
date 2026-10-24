import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fixture, install, settle } from '../../test/helpers/model-setups-fixture.js'
import { waitFor } from '../../test/helpers/wait-for.js'
import { EngineDownloads } from './engine-downloads.js'
import { ModelSetups } from './model-setups.js'
import { downloadRows } from '../workspace-view/index.js'

afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
it('joins the intro Prism install, and pausing its waiting model does not cancel the shared engine', async () => {
  const f = fixture({ prism: true })
  const original = f.link.request
  let installed = false
  let finish!: () => void
  f.link.request = async <T>(method: Parameters<typeof original>[0], path: string, body?: unknown) => {
    if (path === '/engines/atomic-prism/update') {
      f.link.calls.push({ method, path, body })
      return await new Promise<T>((resolve) => {
        finish = () => {
          installed = true
          resolve({} as T)
        }
      })
    }
    if (path === '/backends/atomic-prism')
      return { backends: installed ? [{ version: 'prism-b3-abcdef0', backend: 'cpu' }] : [] } as T
    return original<T>(method, path, body)
  }
  const engines = new EngineDownloads(f.tmp.paths.atcDir, f.link)
  const engine = await engines.enqueue('atomic-prism', {
    target: { version: 'prism-b3-abcdef0', variant: 'cpu' },
    select: true,
  })
  const models = new ModelSetups({
    link: f.link,
    paths: f.tmp.paths,
    downloader: f.downloader,
    fetch: vi.fn(),
    env: {},
    installEngine: (build, taskId) =>
      engines.ensure('atomic-prism', taskId, { version: build.version, variant: build.backend }),
  })
  const model = await install(models, 'prism-ml/Bonsai-gguf', 'Bonsai-Q1_0.gguf')
  await waitFor(async () => (await models.get(model.setup_id)).stage === 'installing_engine')
  await waitFor(() => typeof finish === 'function')
  expect(f.link.calls.filter((call) => call.path.endsWith('/update'))).toHaveLength(1)
  await models.cancel(model.setup_id)
  expect((await engines.list())[0]).toMatchObject({ id: engine.id, stage: 'connecting' })
  expect(f.link.calls.some((call) => call.path.endsWith('/cancel'))).toBe(false)
  await models.resume(model.setup_id)
  finish()
  expect(await settle(models, model.setup_id)).toMatchObject({ stage: 'ready' })
  expect(f.link.calls.filter((call) => call.path.endsWith('/update'))).toHaveLength(1)
  expect(f.link.calls.some((call) => call.path === '/backends/atomic-prism/install')).toBe(false)
})

it('hands the shared engine download over to its model without another client operation', async () => {
  const f = fixture({ prism: true })
  f.hub.hold = true
  const original = f.link.request
  let installed = false
  let finishEngine!: () => void
  f.link.request = async <T>(method: Parameters<typeof original>[0], path: string, body?: unknown) => {
    if (path === '/engines/atomic-prism/update') {
      f.link.calls.push({ method, path, body })
      return await new Promise<T>((resolve) => {
        finishEngine = () => {
          installed = true
          resolve({} as T)
        }
      })
    }
    if (path === '/backends/atomic-prism')
      return { backends: installed ? [{ version: 'prism-b3-abcdef0', backend: 'cpu' }] : [] } as T
    if (path === '/engines/versions')
      return {
        engines: [
          {
            engine: 'atomic-prism',
            active: installed ? { version: 'prism-b3-abcdef0', variant: 'cpu' } : null,
          },
        ],
      } as T
    return original<T>(method, path, body)
  }
  const engines = new EngineDownloads(f.tmp.paths.atcDir, f.link)
  const engine = await engines.enqueue('atomic-prism', {
    target: { version: 'prism-b3-abcdef0', variant: 'cpu' },
    select: true,
  })
  const models = new ModelSetups({
    link: f.link,
    paths: f.tmp.paths,
    downloader: f.downloader,
    fetch: vi.fn(),
    env: {},
    installEngine: (build, taskId) =>
      engines.ensure('atomic-prism', taskId, { version: build.version, variant: build.backend }),
  })
  const model = await install(models, 'prism-ml/Bonsai-gguf', 'Bonsai-Q1_0.gguf')
  const rows = async () =>
    downloadRows(await models.list(), [...(await engines.list()), ...f.downloader.snapshot()])
  await waitFor(async () => (await models.get(model.setup_id)).stage === 'installing_engine')
  await waitFor(() => typeof finishEngine === 'function')
  expect(await rows()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: model.setup_id, state: 'installing_engine' }),
      expect.objectContaining({ id: engine.id, kind: 'engine', state: 'connecting' }),
    ])
  )
  try {
    finishEngine()
    // Only the server continues the work here: no resume, refresh operation, or UI action.
    await waitFor(() => f.downloader.snapshot().some((row) => row.transferred > 0))
    await waitFor(async () => (await engines.list())[0]?.stage === 'ready')
    const active = await rows()
    expect(active).toHaveLength(1)
    expect(active[0]).toMatchObject({
      id: model.setup_id,
      model_id: model.plan.model_id,
      state: 'downloading_model',
      owner: 'setup',
    })
    expect(active[0]!.transferred).toBeGreaterThan(0)
    expect(active[0]!.transferred).toBeLessThan(active[0]!.total)
    expect(f.link.calls.filter((call) => call.path.endsWith('/update'))).toHaveLength(1)
    expect(f.link.calls.some((call) => call.path === '/backends/atomic-prism/install')).toBe(false)
  } finally {
    f.hub.hold = false
    f.hub.release()
    await settle(models, model.setup_id)
  }
})
