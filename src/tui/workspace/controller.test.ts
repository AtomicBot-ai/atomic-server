import { expect, it } from 'vitest'
import { WorkspaceController } from './controller.js'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { resolveConfig } from '../../config/index.js'

it('reloads the selected installed model on explicit server start, without replacing a new model selection', async () => {
  const folder = tmpDataFolder(),
    link = fakeCoreLink(),
    config = resolveConfig({ env: {} })
  config.values.tui.model = 'saved-model'
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
    await c.api(true)
    const load = link.calls.findIndex((call) => call.path.endsWith('/saved-model/load'))
    const start = link.calls.findIndex((call) => call.path === '/server/start')
    expect(load).toBeGreaterThanOrEqual(0)
    expect(start).toBeGreaterThan(load)
    link.calls.length = 0
    await c.loadModel('llamacpp-upstream', 'new-model')
    expect(link.calls.filter((call) => call.path.endsWith('/load')).map((call) => call.path)).toEqual([
      '/models/llamacpp-upstream/new-model/load',
    ])
  } finally {
    c.dispose()
    folder.cleanup()
  }
})
