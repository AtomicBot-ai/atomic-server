import { afterEach, describe, expect, it } from 'vitest'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../config/index.js'
import { WorkspaceService } from './index.js'

const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
function context() {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const link = fakeCoreLink()
  const service = new WorkspaceService({ link, paths: tmp.paths, config: defaultConfig() })
  /** How many snapshots the service has read from the core: each one asks for its health. */
  const reads = () => link.calls.filter((c) => c.path === '/health').length
  return { link, service, reads }
}

describe('snapshots shared between clients', () => {
  it('reads the core once for clients that ask at the same moment or just after', async () => {
    const { service, reads } = context()
    await Promise.all([service.snapshot(), service.snapshot(), service.snapshot()])
    await service.snapshot()
    expect(reads()).toBe(1)
  })

  it('reads again after an operation that changes something, so its client sees the change', async () => {
    const { service, reads } = context()
    expect((await service.snapshot()).keys).toEqual([])
    await service.execute('keys.create', { name: 'ci' })
    expect((await service.snapshot()).keys.map((k) => k.name)).toContain('ci')
    expect(reads()).toBe(2)
  })

  it('does not read again for an operation that only reads', async () => {
    const { service, reads } = context()
    await service.snapshot()
    await service.execute('keys.list')
    await service.snapshot()
    expect(reads()).toBe(1)
  })

  it('reads again after a core event, such as a model that finished loading elsewhere', async () => {
    const { link, service } = context()
    expect((await service.snapshot()).services).toEqual([])
    link.snapshotValue.sessions = [
      { id: 's1', provider: 'llamacpp', model_id: 'qwen', state: 'ready' },
    ] as never
    service.event('session:loaded', {})
    expect((await service.snapshot()).services.map((s) => s.model)).toEqual(['qwen'])
  })

  it('keeps sharing through the core’s log lines, which change nothing it shows', async () => {
    const { service, reads } = context()
    await service.snapshot()
    service.event('core:log', { level: 'info', message: 'engine says hello' })
    await service.snapshot()
    expect(reads()).toBe(1)
  })

  it('checks guided setup against the core as it is now, never a shared copy', async () => {
    const { service, reads } = context()
    await service.snapshot()
    await expect(service.execute('setup.complete')).rejects.toThrow('Start the API and load a model')
    expect(reads()).toBe(2)
  })

  it('checks a start against the core as it is now, never a shared copy', async () => {
    const { service, reads } = context()
    await service.snapshot()
    await service.execute('api.start').catch(() => undefined)
    expect(reads()).toBeGreaterThanOrEqual(2)
  })
})
