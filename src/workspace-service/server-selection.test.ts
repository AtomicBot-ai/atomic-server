import { afterEach, expect, it, vi } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { defaultConfig, resolveConfig, writeConfigFile } from '../config/index.js'
import { EngineSelection } from '../terminal-setup/index.js'
import { ClientKeys } from '../terminal-data/index.js'
import { WorkspaceService } from './service.js'
const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
async function fixture(
  running = false,
  options: {
    engine?: string
    provider?: string
    providers?: string[]
    env?: NodeJS.ProcessEnv
  } = {}
) {
  const tmp = tmpDataFolder(),
    link = fakeCoreLink()
  cleanup.push(tmp.cleanup)
  const saved = defaultConfig()
  saved.tui.model = 'device-model'
  await writeConfigFile(tmp.paths.configFile, saved)
  const config = resolveConfig({ fileText: JSON.stringify(saved), env: options.env ?? {} }).values
  await new EngineSelection(tmp.paths.atcDir, async () => link).remember(options.engine ?? 'llamacpp|b1|cpu')
  await new ClientKeys(tmp.paths.atcDir).initialize('test-key')
  link.snapshotValue.server.running = running
  for (const provider of ['llamacpp', 'llamacpp-upstream', 'atomic-prism'])
    link.responses[`GET /backends/${provider}`] = { backends: [{ version: 'b1', variant: 'cpu' }] }
  const start = vi.spyOn(link.server, 'start').mockImplementation(async () => {
    link.snapshotValue.server.running = true
    return link.snapshotValue.server
  })
  const load = vi.spyOn(link.models, 'load').mockImplementation(async (provider, model_id) => {
    const session = { provider, model_id, port: 8000, state: 'ready' } as never
    link.snapshotValue.sessions = [session]
    return session
  })
  const service = new WorkspaceService({
    link,
    paths: tmp.paths,
    config,
    ...(options.env ? { env: options.env } : {}),
    probePort: async () => (link.snapshotValue.server.running ? 'busy' : 'free'),
  })
  const execute = service.execute.bind(service)
  vi.spyOn(service, 'execute').mockImplementation((name, input) =>
    name === 'models.installed'
      ? Promise.resolve(
          ['device-model', 'env-model'].map((id) => ({
            id,
            provider: options.provider ?? 'llamacpp-upstream',
            providers: options.providers ?? ['llamacpp-upstream', 'llamacpp'],
            name: 'Local model',
          }))
        )
      : execute(name, input)
  )
  return { ...tmp, service, link, load, start }
}
it.each([false, true])(
  'finishes local-model onboarding with a loaded model when API running=%s',
  async (running) => {
    const { service, load } = await fixture(running)
    const before = await service.snapshot()
    expect(before.selection).toEqual({ engine: 'llamacpp|b1|cpu', model: 'device-model' })
    expect(before.setups).toEqual([])
    await service.execute('setup.manual')
    expect(load).toHaveBeenCalledWith('llamacpp', 'device-model', {})
    const after = await service.snapshot()
    expect(after.api.running).toBe(true)
    expect(after.setup?.complete).toBe(true)
    expect(after.services).toContainEqual(
      expect.objectContaining({ model: 'device-model', provider: 'llamacpp' })
    )
    await service.execute('setup.manual')
    expect(load).toHaveBeenCalledTimes(1)
  }
)
it('restores the selection even with an already running listener and does not reload a live model', async () => {
  const { service, load } = await fixture(true)
  await service.execute('api.start', { restore_selected: true })
  await service.execute('api.start', { restore_selected: true })
  expect(load).toHaveBeenCalledTimes(1)
})
it('leaves unfinished downloads alone when finishing onboarding', async () => {
  const { service, load, start } = await fixture()
  await service.execute('config.update', { values: { 'tui.model': 'still-downloading' } })
  await service.execute('setup.manual')
  expect(load).not.toHaveBeenCalled()
  expect(start).not.toHaveBeenCalled()
  expect((await service.snapshot()).setup?.complete).toBe(true)
})
it('does not mark setup finished when the engine refuses to load and lets the user retry', async () => {
  const { service, load } = await fixture()
  load.mockRejectedValueOnce(new Error('Not enough memory'))
  await expect(service.execute('setup.manual')).rejects.toThrow('Not enough memory')
  expect((await service.snapshot()).setup?.complete).not.toBe(true)
  await service.execute('setup.manual')
  expect((await service.snapshot()).setup?.complete).toBe(true)
})

it.each([
  ['atomic-prism|b1|cpu', 'llamacpp-upstream', ['llamacpp-upstream', 'atomic-prism'], 'atomic-prism'],
  ['sglang', 'vllm', ['vllm', 'sglang'], 'sglang'],
  ['mlx', 'llamacpp-upstream', ['llamacpp-upstream'], 'llamacpp-upstream'],
] as const)(
  'restores %s only when the installed model supports it',
  async (engine, provider, providers, expected) => {
    const { service, load } = await fixture(false, { engine, provider, providers: [...providers] })
    await service.execute('api.start', { restore_selected: true })
    expect(load).toHaveBeenCalledWith(expected, 'device-model', {})
  }
)
it('does not reload the selected Prism model when it is already serving', async () => {
  const { service, link, load } = await fixture(true, {
    engine: 'atomic-prism|b1|cpu',
    providers: ['llamacpp-upstream', 'atomic-prism'],
  })
  link.snapshotValue.sessions = [
    { provider: 'atomic-prism', model_id: 'device-model', state: 'ready' },
  ] as never
  await service.execute('api.start', { restore_selected: true })
  expect(load).not.toHaveBeenCalled()
})
it('keeps the model environment override when the file is edited while the server runs', async () => {
  const { service, load } = await fixture(false, { env: { ATC_TUI_MODEL: 'env-model' } })
  expect((await service.snapshot()).selection?.model).toBe('env-model')
  await service.execute('config.update', { values: { 'tui.model': 'device-model' } })
  expect((await service.snapshot()).selection?.model).toBe('env-model')
  await service.execute('api.start', { restore_selected: true })
  expect(load).toHaveBeenCalledWith('llamacpp', 'env-model', {})
})
