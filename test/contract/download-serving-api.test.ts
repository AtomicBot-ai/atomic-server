/** New engine downloads must leave existing non-chat workloads and API controls available. */
import { expect, it, vi } from 'vitest'
import { defaultConfig } from '../../src/config/index.js'
import { ClientKeys } from '../../src/terminal-data/index.js'
import { WorkspaceService } from '../../src/workspace-service/index.js'
import { fakeCoreLink } from '../helpers/fake-core-link.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

it.each(['audio', 'diffusion', 'embedding'])(
  'keeps the API serving %s through a queued download and explicit restart',
  async (kind) => {
    const tmp = tmpDataFolder(),
      link = fakeCoreLink(),
      config = defaultConfig()
    config.api.port = 0
    link.snapshotValue.server.running = true
    link.responses[`GET /${kind}/status`] = { model: { state: 'loaded', loaded: { modelId: 'serving' } } }
    let release!: () => void
    const transfer = new Promise<void>((resolve) => {
      release = resolve
    })
    link.responses['POST /engines/llamacpp-upstream/update'] = () => transfer
    const stop = vi.spyOn(link.server, 'stop').mockImplementation(async () => {
      link.snapshotValue.server.running = false
      return link.snapshotValue.server
    })
    vi.spyOn(link.server, 'start').mockImplementation(async () => {
      link.snapshotValue.server.running = true
      return link.snapshotValue.server
    })
    const service = new WorkspaceService({ link, paths: tmp.paths, config, probePort: async () => 'free' })
    try {
      await new ClientKeys(tmp.paths.atcDir).initialize('test-key')
      await service.execute('engines.enqueue', {
        engine: 'llamacpp-upstream',
        target: { version: 'b1', variant: 'cpu' },
      })
      expect(stop).not.toHaveBeenCalled()
      const pending = await service.snapshot({ fresh: true })
      expect(pending.api.running).toBe(true)
      expect(pending.downloads).toContainEqual(expect.objectContaining({ kind: 'engine' }))
      expect(pending.services).toContainEqual(expect.objectContaining({ state: 'loaded' }))
      await service.execute('api.restart')
      expect(stop).toHaveBeenCalledOnce()
      expect((await service.snapshot({ fresh: true })).api.running).toBe(true)
    } finally {
      release()
      await vi.waitFor(async () => {
        const state = await service.snapshot({ fresh: true })
        expect(state.downloads).toContainEqual(expect.objectContaining({ kind: 'engine', stage: 'ready' }))
      })
      await service.stop()
      tmp.cleanup()
    }
  }
)
