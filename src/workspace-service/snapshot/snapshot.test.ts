import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { AtomicCoreError } from '@atomic-chat/core'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { environment, installation, operation } from '../../../test/helpers/managed-fixtures.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { defaultConfig } from '../../config/index.js'
import { WorkspaceService } from '../index.js'

const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))

function context() {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const link = fakeCoreLink()
  const service = new WorkspaceService({ link, paths: tmp.paths, config: defaultConfig() })
  return { link, service, paths: tmp.paths }
}
const progress = (stage: string, elapsed_ms = 1) => ({
  provider: 'vllm',
  model_id: 'Qwen/Qwen3.5-2B',
  generation: 'g1',
  stage,
  elapsed_ms,
})

describe('audio in the workspace snapshot', () => {
  const noRoute = new AtomicCoreError('INVALID_ARGUMENT', 'No such control route: /audio/status')

  it('stays quiet on a core without audio: no row, no error, and clients told not to offer it', async () => {
    const { link, service } = context()
    link.responses['GET /audio/status'] = noRoute
    const snap = await service.snapshot()
    expect(snap.audio_available).toBe(false)
    expect(snap.services).toEqual([])
    expect(snap.errors).toEqual([])
    expect(snap.eye).toBe('offline')
  })

  it('offers audio with nothing loaded', async () => {
    const { link, service } = context()
    link.responses['GET /audio/status'] = { model: { state: 'unloaded', loaded: null }, activeJob: null }
    const snap = await service.snapshot()
    expect(snap.audio_available).toBe(true)
    expect(snap.services).toEqual([])
  })

  it('lists the loaded model as a service of audio.cpp', async () => {
    const { link, service } = context()
    const loaded = { modelId: 'moss:q8_0', mode: 'speech' }
    link.responses['GET /audio/status'] = { model: { state: 'loaded', loaded }, activeJob: null }
    const snap = await service.snapshot()
    expect(snap.services).toMatchObject([
      { id: 'audio', kind: 'audio', provider: 'audio-cpp', model: 'moss:q8_0', state: 'loaded' },
    ])
  })

  it('shows a running job as busy', async () => {
    const { link, service } = context()
    link.snapshotValue.server = { ...link.snapshotValue.server, running: true }
    link.responses['GET /audio/status'] = {
      model: { state: 'loaded', loaded: { modelId: 'moss:q8_0' } },
      activeJob: { id: 'j' },
    }
    expect((await service.snapshot()).eye).toBe('busy')
  })

  it('reports a failed read of a core with audio, unlike a missing route', async () => {
    const { link, service } = context()
    link.responses['GET /audio/status'] = new AtomicCoreError('INTERNAL_ERROR', 'boom')
    const snap = await service.snapshot()
    expect(snap.audio_available).toBe(true)
    expect(snap.errors).toEqual([{ source: 'audio', message: 'boom' }])
  })
})

describe('the workspace snapshot', () => {
  it('lists managed installations and unfinished operations, with phase, progress, digest and error', async () => {
    const { link, service } = context()
    const pulling = operation('sglang', 'pulling-image', {
      plan_digest: `sha256:${'a'.repeat(64)}`,
      progress: { completed_bytes: 5, total_bytes: 10 } as never,
    })
    link.snapshotValue.environments = [environment({ installations: [installation('vllm')] })]
    link.snapshotValue.environment_operations = [pulling, operation('vllm', 'ready')]
    const snap = await service.snapshot()
    expect(snap.engines).toEqual([
      { engine: 'sglang', installation: null, operation: pulling },
      { engine: 'vllm', installation: installation('vllm'), operation: null },
    ])
  })

  it('lists the privileged steps waiting for a person, with the command, as atc status does', async () => {
    const { link, service, paths } = context()
    link.snapshotValue.environment_operations = [
      operation('tensorrt-llm', 'preparing-host', { pending_host_step: { step_id: 's1' } as never }),
    ]
    mkdirSync(dirname(paths.hostStepsJournal), { recursive: true })
    const entry = (step_id: string, state: string) => ({
      operation_id: 'op-tensorrt-llm',
      step_id,
      step: { step_id },
      request_path: `/r/${step_id}.json`,
      state,
      instructions: `sudo atc host-step exec /r/${step_id}.json`,
      updated_at: 7,
    })
    writeFileSync(
      paths.hostStepsJournal,
      JSON.stringify([entry('s0', 'posted'), entry('s1', 'pending-manual')])
    )
    expect((await service.snapshot()).host_steps).toEqual([
      {
        step_id: 's1',
        operation_id: 'op-tensorrt-llm',
        instructions: 'sudo atc host-step exec /r/s1.json',
        updated_at: 7,
      },
    ])
  })

  it('keeps the last load stage per provider and model, and drops it at ready', async () => {
    const { service } = context()
    service.event('session:load-progress', progress('starting-container', 2100))
    service.event('session:load-progress', progress('initializing-engine', 41000))
    expect((await service.snapshot()).loads).toEqual([
      expect.objectContaining({
        provider: 'vllm',
        model_id: 'Qwen/Qwen3.5-2B',
        stage: 'initializing-engine',
        elapsed_ms: 41000,
      }),
    ])
    service.event('session:load-progress', progress('ready', 63000))
    expect((await service.snapshot()).loads).toEqual([])
  })

  it('drops the stage when the load fails or the session ends', async () => {
    const { link, service } = context()
    link.models.load = async () => {
      service.event('session:load-progress', progress('starting-container'))
      throw new AtomicCoreError('MODEL_LOAD_FAILED', 'The container exited.')
    }
    await expect(
      service.execute('models.load', { provider: 'vllm', model_id: 'Qwen/Qwen3.5-2B' })
    ).rejects.toThrow()
    expect((await service.snapshot()).loads).toEqual([])
    service.event('session:load-progress', progress('starting-container'))
    service.event('session:died', { provider: 'vllm', model_id: 'Qwen/Qwen3.5-2B', pid: null })
    expect((await service.snapshot()).loads).toEqual([])
  })
})
