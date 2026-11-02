/** The pinned core offers audio without installing an engine or loading a model. */
import { AtomicCore } from '@atomic-chat/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defaultConfig, resolveConfig } from '../../src/config/index.js'
import { startDaemon } from '../../src/daemon/index.js'
import type { RunningDaemon } from '../../src/daemon/index.js'
import { recordingIo } from '../../src/io.js'
import { createLogger } from '../../src/output/index.js'
import { WorkspaceService } from '../../src/workspace-service/index.js'
import { fakeHost } from '../helpers/test-context.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

const { paths, cleanup } = tmpDataFolder('atc-audio-core-')
let daemon: RunningDaemon
let service: WorkspaceService

beforeAll(async () => {
  daemon = await startDaemon({
    paths,
    io: recordingIo(),
    config: resolveConfig({ env: { ATC_API_AUTO_START: 'false', ATC_UPDATE_CHECK_ON_START: 'false' } }),
    host: fakeHost(),
    log: createLogger(() => {}, { level: 'silent' }),
    controlPort: 0,
    admin: { enabled: false },
    telemetry: false,
    createCore: (options) =>
      AtomicCore.create({
        ...options,
        fetch: (async () => new Response('{}', { status: 404 })) as typeof fetch,
      }),
  })
  service = new WorkspaceService({
    link: daemon.link,
    paths,
    config: defaultConfig(),
    fetch: (async () => new Response('{}', { status: 404 })) as typeof fetch,
  })
}, 60_000)

afterAll(async () => {
  await daemon.shutdown().catch(() => undefined)
  cleanup()
})

describe('audio in the pinned core', () => {
  it('leaves an unloaded workspace quiet', async () => {
    const snapshot = await service.snapshot()
    expect(snapshot.errors).toEqual([])
    expect(snapshot.services.some((s) => s.kind === 'audio')).toBe(false)
  })

  it('offers audio.cpp through the core engine registry', async () => {
    const { engines } = (await service.execute('engines.list')) as { engines: Array<{ engine: string }> }
    expect(engines.map((e) => e.engine)).toContain('audio-cpp')
  })

  it('reads the unloaded audio status and empty model/gallery lists', async () => {
    await expect(service.execute('audio.status')).resolves.toMatchObject({
      model: { state: 'unloaded', loaded: null },
      activeJob: null,
    })
    await expect(service.execute('audio.files')).resolves.toMatchObject({ files: [] })
    await expect(service.execute('audio.gallery')).resolves.toMatchObject({ items: [], total: 0 })
  })

  it.each([
    ['audio.capabilities', {}],
    ['audio.generate', { mode: 'speech', request: { text: 'Hello' } }],
    ['audio.generate', { mode: 'effects', request: { text: 'A door' } }],
  ])('%s preserves the core refusal when no model is selected', async (operation, input) => {
    await expect(service.execute(operation, input)).rejects.toMatchObject({ code: 'MODEL_NOT_LOADED' })
  })
})
