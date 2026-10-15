import { afterEach, describe, expect, it, vi } from 'vitest'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../config/index.js'
import { ClientKeys } from '../terminal-data/index.js'
import { WORKSPACE_OPERATIONS, WorkspaceService, readWorkspaceSetup } from './index.js'
const cleanup: Array<() => void> = []
function context(request?: typeof fetch) {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const link = fakeCoreLink(),
    config = defaultConfig()
  return {
    ...tmp,
    link,
    config,
    service: new WorkspaceService({ link, paths: tmp.paths, config, ...(request ? { fetch: request } : {}) }),
  }
}
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
})
describe('workspace operations', () => {
  it('validates required input and refuses unregistered routes before touching Core', async () => {
    const { service, link } = context()
    await expect(service.execute('shutdown')).rejects.toThrow('Unknown operation')
    await expect(service.execute('models.load', { model_id: 'q' })).rejects.toThrow('provider is required')
    await expect(
      service.execute('models.load', { provider: 'p', model_id: 'q', force: true })
    ).rejects.toThrow('Unknown input')
    await expect(service.execute('keys.create', { name: 7 })).rejects.toThrow('name must be string')
    expect(link.calls).toEqual([])
    expect(WORKSPACE_OPERATIONS.find((o) => o.name === 'keys.create')?.mutates).toBe(true)
  })
  it('refuses a relative import path instead of resolving it against the server folder', async () => {
    const { service, link } = context()
    await expect(service.execute('models.import', { path: './model.gguf' })).rejects.toThrow('absolute path')
    expect(link.calls).toEqual([])
  })
  it('installs only a plan reviewed on this server, without asking the core to download', async () => {
    const { service, link } = context()
    await expect(
      service.execute('models.install', {
        request: { repo: 'AtomicChat/example', file: 'model.gguf' },
        plan_digest: 'a'.repeat(64),
        request_id: 'same-request',
      })
    ).rejects.toThrow('models.plan')
    expect(link.calls).toEqual([])
    expect(await service.execute('setup.status')).toEqual({ setups: [] })
  })
  it('reports model downloads from its own downloader beside the core engine installs', async () => {
    const request = vi.fn<typeof fetch>(async (input, init) =>
      String(input).includes('/resolve/')
        ? new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new Uint8Array(400))
                init?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')))
              },
            }),
            { headers: { 'content-length': '1000' } }
          )
        : Response.json({ siblings: [{ rfilename: 'm.gguf', size: 1000 }] })
    )
    const { service, link } = context(request)
    link.snapshotValue.downloads = [{ taskId: 'engine-build', transferred: 1, total: 2, percent: 50 }]
    link.request = async <T>(_method: string, path: string) =>
      (path === '/models/compatibility'
        ? { outcome: 'compatible', provider: null, requires: [], reason: 'stock' }
        : { families: [] }) as T
    const plan = (await service.execute('models.plan', { repo: 'o/r', file: 'm.gguf' })) as { digest: string }
    const started = (await service.execute('models.install', {
      request: { repo: 'o/r', file: 'm.gguf' },
      plan_digest: plan.digest,
      request_id: 'one',
    })) as { setup_id: string; task_ids: { model: string } }
    await vi.waitFor(async () =>
      expect((await service.snapshot()).downloads).toEqual([
        { taskId: 'engine-build', transferred: 1, total: 2, percent: 50 },
        { taskId: started.task_ids.model, transferred: 400, total: 1000, percent: 40 },
      ])
    )
    expect((await service.snapshot()).setups).toMatchObject([
      { request_id: 'one', stage: 'downloading_model' },
    ])
    expect(await service.execute('setup.cancel', { setup_id: started.setup_id })).toMatchObject({
      stage: 'cancelled',
    })
    expect((await service.snapshot()).downloads).toHaveLength(1)
  })
  it('does not disclose keys in snapshots and persists manual setup independently of Core', async () => {
    const { service, paths } = context()
    const keys = new ClientKeys(paths.atcDir)
    await keys.initialize('my-test-private-key')
    await service.execute('setup.manual')
    expect(await readWorkspaceSetup(paths)).toMatchObject({ mode: 'manual', complete: true })
    const snapshot = await service.snapshot()
    expect(JSON.stringify(snapshot)).not.toContain('my-test-private-key')
    expect(snapshot.metrics.active).toBeNull()
    expect(await service.execute('keys.reveal')).toEqual({ key: 'my-test-private-key' })
  })
  it('uses the local listener and authenticated full chat response; history preserves rich parts', async () => {
    const response = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Done',
            tool_calls: [{ id: 'one', type: 'function', function: { name: 'test', arguments: '{}' } }],
          },
        },
      ],
      usage: { completion_tokens: 1 },
    }
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(response)))
    const { service, link, paths } = context(request)
    link.snapshotValue.server.running = true
    await new ClientKeys(paths.atcDir).initialize('test-key')
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } },
        ],
      },
    ]
    const result = (await service.execute('chat.complete', {
      request: { model: 'vision', messages },
    })) as Record<string, unknown>
    expect(result['usage']).toEqual({ completion_tokens: 1 })
    expect(request.mock.calls[0]?.[0]).toBe('http://127.0.0.1:1337/v1/chat/completions')
    expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer test-key' })
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toMatchObject({ stream: false, messages })
    expect(await service.execute('history.load', { id: result['conversation_id'] })).toMatchObject({
      messages: [messages[0], response.choices[0]!.message],
    })
  })
  it('checks actual inference before marking guided setup complete', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ error: { message: 'load failed' } }), { status: 503 }))
    const { service, paths, link } = context(request)
    await new ClientKeys(paths.atcDir).initialize('test-key')
    link.snapshotValue.server.running = true
    link.snapshotValue.sessions = [{ model_id: 'broken', provider: 'llamacpp-upstream' }] as never
    await expect(service.execute('setup.complete')).rejects.toThrow('load failed')
    expect(await readWorkspaceSetup(paths)).toBeNull()
  })
  it('probes the selected workload instead of an older loaded model', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'OK' } }] }))
      )
    const { service, link, paths } = context(request)
    await new ClientKeys(paths.atcDir).initialize('test-key')
    link.snapshotValue.server.running = true
    link.snapshotValue.sessions = [
      { model_id: 'old', provider: 'llamacpp-upstream' },
      { model_id: 'selected', provider: 'llamacpp-upstream' },
    ] as never
    await service.execute('setup.complete', { model_id: 'selected' })
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body)).model).toBe('selected')
    await expect(service.execute('setup.complete', { model_id: 'missing' })).rejects.toThrow('Load a model')
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('uses the configured decision model ID when completing its selected setup', async () => {
    const { service, link } = context()
    link.snapshotValue.server.running = true
    link.request = async <T>(method: string, path: string, body?: unknown) => {
      link.calls.push({ method, path, body })
      if (path === '/decision/status') return { state: 'ready', model_path: '/models/decision.gguf' } as T
      if (path === '/decision/config') return { model_id: 'selected-decision' } as T
      if (path === '/decision/decide') return { unavailable: false, result: {} } as T
      return {} as T
    }
    await service.execute('setup.complete', { model_id: 'selected-decision' })
    expect(link.calls).toContainEqual(expect.objectContaining({ path: '/decision/decide' }))
  })
})
