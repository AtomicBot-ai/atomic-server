import { expect, it, vi } from 'vitest'
import { WorkspaceController } from './controller.js'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { resolveConfig } from '../../config/index.js'

it('reloads the selected installed model on explicit server start, without replacing a new model selection', async () => {
  const folder = tmpDataFolder(),
    link = fakeCoreLink(),
    config = resolveConfig({ env: {} })
  config.values.tui.model = 'saved-model'
  link.responses['GET /backends/llamacpp-upstream'] = { backends: [{ version: 'b1', variant: 'cpu' }] }
  const c = new WorkspaceController(
    {
      request: fetch,
      apiKey: '',
      chatKey: '',
      base: {
        paths: folder.paths,
        attach: async () => link,
        loadConfig: async () => config,
        runDoctor: async () => [],
        pendingHostSteps: async () => [],
        loginUrl: async () => '',
        openUrl: async () => undefined,
        now: () => new Date(),
      },
    },
    () => undefined,
    () => undefined,
    () => undefined
  )
  c.installed = async () => [{ id: 'saved-model', provider: 'llamacpp-upstream', name: 'Saved model' }]
  try {
    expect(link.calls).toEqual([])
    const execute = vi.spyOn(c.runtime, 'execute')
    await c.api(true)
    expect(execute).toHaveBeenCalledWith('models.load', {
      provider: 'llamacpp-upstream',
      model_id: 'saved-model',
    })
    const load = link.calls.findIndex((call) => call.path.endsWith('/saved-model/load'))
    const start = link.calls.findIndex((call) => call.path === '/server/start')
    expect(load).toBeGreaterThanOrEqual(0)
    expect(start).toBeGreaterThan(load)
    link.calls.length = 0
    // Through the server's models.load: its load stage is dropped there when the load fails.
    await c.loadModel('llamacpp-upstream', 'new-model')
    expect(execute).toHaveBeenCalledWith('models.load', {
      provider: 'llamacpp-upstream',
      model_id: 'new-model',
    })
    expect(link.calls.filter((call) => call.path.endsWith('/load')).map((call) => call.path)).toEqual([
      '/models/llamacpp-upstream/new-model/load',
    ])
  } finally {
    c.dispose()
    folder.cleanup()
  }
})

it('turns a managed engine’s context overflow in the chat into the limit, the length and the setting', async () => {
  const folder = tmpDataFolder(),
    link = fakeCoreLink(),
    config = resolveConfig({ env: {} })
  link.snapshotValue.sessions = [{ provider: 'tensorrt-llm', model_id: 'qwen', port: 0 } as never]
  const message =
    "This model's maximum context length is 4096 tokens. However, your messages resulted in 5120 tokens."
  const c = new WorkspaceController(
    {
      request: (async () =>
        new Response(JSON.stringify({ error: { message } }), { status: 400 })) as unknown as typeof fetch,
      apiKey: '',
      chatKey: '',
      base: {
        paths: folder.paths,
        attach: async () => link,
        loadConfig: async () => config,
        runDoctor: async () => [],
        pendingHostSteps: async () => [],
        loginUrl: async () => '',
        openUrl: async () => undefined,
        now: () => new Date(),
      },
    },
    () => undefined,
    () => undefined,
    () => undefined
  )
  try {
    await expect(
      c.chat('http://127.0.0.1:1337/v1', 'qwen', [{ role: 'user', content: 'hi' }], () => {})
    ).rejects.toThrow(/5120 tokens.*atc config set engine\.tensorrt-llm\.context_length/s)
  } finally {
    c.dispose()
    folder.cleanup()
  }
})
