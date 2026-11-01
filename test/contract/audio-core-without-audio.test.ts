/**
 * The pinned core has no audio. Against the real one: the workspace stays whole and quiet, audio is not
 * offered, and whoever asks for it anyway gets one plain answer.
 *
 * core-workaround: no-audio-core-test until core 0.21.0 — the pinned core has audio then: test that it is
 * offered instead.
 */
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

const { paths, cleanup } = tmpDataFolder('atc-no-audio-')
const NO_AUDIO = "this server's core has no audio"
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
    createCore: (options) => AtomicCore.create(options),
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

describe('a core without audio', () => {
  it('leaves the snapshot whole, with no audio row and no error', async () => {
    const snapshot = await service.snapshot()
    expect(snapshot.audio_available).toBe(false)
    expect(snapshot.errors).toEqual([])
    expect(snapshot.services.some((s) => s.kind === 'audio')).toBe(false)
  })

  it('leaves the engine list as it was', async () => {
    const { engines } = (await service.execute('engines.list')) as { engines: Array<{ engine: string }> }
    expect(engines.length).toBeGreaterThan(0)
    expect(engines.map((e) => e.engine)).not.toContain('audio-cpp')
  })

  it.each([
    ['audio.status', {}],
    ['audio.capabilities', {}],
    ['audio.files', {}],
    ['audio.gallery', {}],
    ['audio.unload', {}],
    ['audio.job', { id: 'j' }],
    ['audio.cancel', { id: 'j' }],
    ['audio.delete', { id: 'j' }],
    ['audio.generate', { mode: 'speech', request: { text: 'Hello' } }],
    ['audio.generate', { mode: 'effects', request: { text: 'A door' } }],
    ['audio.configure', { request: {} }],
    ['engines.install', { engine: 'audio-cpp' }],
    ['engines.enqueue', { engine: 'audio-cpp' }],
    ['engines.catalog', { engine: 'audio-cpp' }],
    ['artifacts.plan', { category: 'audio', model_id: 'moss-tts-nano-100m' }],
  ])('%s %j answers that it has none', async (operation, input) => {
    await expect(service.execute(operation, input)).rejects.toThrow(NO_AUDIO)
  })

  it('still lists the audio catalog, and nothing queued for it', async () => {
    const { rows } = (await service.execute('models.catalog', { category: 'audio' })) as { rows: unknown[] }
    expect(rows).toHaveLength(4)
    const snapshot = await service.snapshot()
    expect(snapshot.downloads).toEqual([])
    expect(snapshot.setups).toEqual([])
  })
})
