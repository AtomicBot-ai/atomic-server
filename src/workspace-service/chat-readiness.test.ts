import { afterEach, expect, it, vi } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { defaultConfig } from '../config/index.js'
import { ClientKeys } from '../terminal-data/index.js'
import { WorkspaceService } from './service.js'
import { cloudChatServices, chatProvider } from './chat-readiness.js'
const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))
const providers = [
  {
    provider: 'openai',
    models: ['gpt-test'],
    has_api_key: true,
    custom_headers: [{ header: 'Authorization', value: 'secret' }],
  },
]
it('lists configured cloud models without local sessions or any credential/header data', async () => {
  const link = fakeCoreLink()
  link.responses['GET /cloud/providers'] = { providers }
  expect(await cloudChatServices(link)).toEqual([
    {
      id: 'cloud:openai:gpt-test',
      provider: 'openai',
      model: 'gpt-test',
      kind: 'chat',
      state: 'ready',
      details: { cloud: true },
    },
  ])
  expect(await chatProvider(link, 'gpt-test', 'openai')).toBe('openai')
  await expect(chatProvider(link, 'not-enabled', 'openai')).rejects.toThrow('Choose a ready model')
})
it('honors selected local routing and refuses mismatched explicit provider instead of changing global routing', async () => {
  const link = fakeCoreLink()
  link.snapshotValue.sessions = [{ model_id: 'gpt-test', provider: 'llamacpp-upstream' }] as never
  link.responses['GET /cloud/providers'] = { providers }
  expect(await chatProvider(link, 'gpt-test')).toBe('openai')
  await expect(chatProvider(link, 'gpt-test', 'llamacpp-upstream')).rejects.toThrow('served by openai')
  link.responses['GET /server/selection'] = { models: [{ model: 'gpt-test', provider: 'llamacpp-upstream' }] }
  expect(await chatProvider(link, 'gpt-test', 'llamacpp-upstream')).toBe('llamacpp-upstream')
  expect(link.calls.every((c) => c.method === 'GET')).toBe(true)
})
it('admits cloud-only Start and streamed chat through the authenticated local API', async () => {
  const folder = tmpDataFolder()
  cleanup.push(folder.cleanup)
  const link = fakeCoreLink(),
    request = vi.fn<typeof fetch>(
      async () => new Response('data: {"choices":[{"delta":{"content":"Cloud reply"}}]}\n\ndata: [DONE]\n\n')
    )
  link.responses['GET /cloud/providers'] = { providers }
  const service = new WorkspaceService({ link, paths: folder.paths, config: defaultConfig(), fetch: request })
  await new ClientKeys(folder.paths.atcDir).initialize('local-api-key')
  expect((await service.snapshot()).services[0]).toMatchObject({
    model: 'gpt-test',
    details: { cloud: true },
  })
  await service.execute('api.start')
  expect(link.calls.some((c) => c.path === '/server/start')).toBe(true)
  link.snapshotValue.server.running = true
  const job = (await service.execute('chat.start', {
    provider: 'openai',
    request: { model: 'gpt-test', messages: [{ role: 'user', content: 'Hello' }] },
  })) as { id: string }
  await vi.waitFor(async () =>
    expect(await service.execute('chat.progress', { id: job.id })).toMatchObject({
      state: 'complete',
      message: { content: 'Cloud reply' },
    })
  )
  expect(request.mock.calls[0]?.[0]).toBe('http://127.0.0.1:1337/v1/chat/completions')
  expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer local-api-key' })
  expect(JSON.stringify(await service.snapshot())).not.toContain('secret')
})
