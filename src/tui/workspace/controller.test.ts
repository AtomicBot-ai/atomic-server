import { expect, it, vi } from 'vitest'
import { WorkspaceController } from './controller.js'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { resolveConfig } from '../../config/index.js'

it('delegates API restoration to the shared service without replacing an explicit model load', async () => {
  const folder = tmpDataFolder(),
    link = fakeCoreLink(),
    config = resolveConfig({ env: {} })
  config.values.tui.model = 'saved-model'
  link.responses['GET /backends/llamacpp-upstream'] = { backends: [{ version: 'b1', variant: 'cpu' }] }
  const loadModel = link.models.load
  link.models.load = async (provider, modelId) => {
    const session = await loadModel(provider, modelId)
    link.snapshotValue.sessions = [{ ...session, provider } as never]
    return session
  }
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
    const original = c.runtime.execute.bind(c.runtime)
    const execute = vi
      .spyOn(c.runtime, 'execute')
      .mockImplementation((name, input) =>
        name === 'api.start' ? original(name, { ...input, restore_selected: false }) : original(name, input)
      )
    await c.api(true)
    expect(execute).toHaveBeenCalledWith('api.start', { restore_selected: true })
    expect(link.calls.some((call) => call.path === '/server/start')).toBe(true)
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
  link.snapshotValue.server.running = true
  const message =
    "This model's maximum context length is 4096 tokens. However, your messages resulted in 5120 tokens."
  const request = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(JSON.stringify({ error: { message } }), { status: 400 }))
  const c = new WorkspaceController(
    {
      request,
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
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]?.[0]).toBe('http://127.0.0.1:1337/v1/chat/completions')
    expect(link.calls.some((call) => call.path === '/server/start')).toBe(false)
  } finally {
    c.dispose()
    folder.cleanup()
  }
})

it('sends a Playground that follows this server through the server, whatever port its own config names', async () => {
  const folder = tmpDataFolder(),
    link = fakeCoreLink(),
    // The terminal's config already says 62732; the API still answers where the snapshot says.
    config = resolveConfig({ env: {}, flags: { 'api.port': 62732 } })
  const request = vi.fn<typeof fetch>()
  const c = new WorkspaceController(
    {
      request,
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
  const read = vi.spyOn(c.runtime, 'read').mockRejectedValue(new Error('through the server'))
  try {
    await expect(c.chat(null, 'qwen', [{ role: 'user', content: 'hi' }], () => {})).rejects.toThrow(
      'through the server'
    )
    expect(read).toHaveBeenCalledWith('chat.start', expect.anything())
    expect(request).not.toHaveBeenCalled()
  } finally {
    c.dispose()
    folder.cleanup()
  }
})
