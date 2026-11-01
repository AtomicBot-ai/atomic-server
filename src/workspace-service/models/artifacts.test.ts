import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AtomicCoreError } from '@atomic-chat/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../../config/index.js'
import { WorkspaceService } from '../index.js'
const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
describe('durable media installation', () => {
  it('downloads catalog-pinned files in the background, keeps the job and loads via the task module', async () => {
    const tmp = tmpDataFolder()
    cleanup.push(tmp.cleanup)
    const payload = 'small test checkpoint',
      sha = createHash('sha256').update(payload).digest('hex'),
      link = fakeCoreLink()
    const original = link.request
    link.request = async <T>(
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      path: string,
      body?: unknown
    ) =>
      path === '/backends/llamacpp-upstream'
        ? ({ backends: [{ version: 'test' }] } as T)
        : original<T>(method, path, body)
    let release!: (response: Response) => void
    const download = new Promise<Response>((resolve) => {
      release = resolve
    })
    const request = vi.fn<typeof fetch>(async (input) =>
      String(input).includes('raw.githubusercontent.com')
        ? new Response(
            JSON.stringify({
              models: [
                {
                  id: 'tiny',
                  name: 'Tiny',
                  repo: 'test/tiny',
                  revision: 'pinned',
                  context: 512,
                  engine: 'llamacpp-upstream',
                  files: [{ path: 'tiny.gguf', role: 'model', bytes: payload.length, sha256: sha }],
                },
              ],
            })
          )
        : download
    )
    const options = { paths: tmp.paths, link, config: defaultConfig(), fetch: request },
      service = new WorkspaceService(options)
    const plan = (await service.execute('artifacts.plan', { category: 'embedding', model_id: 'tiny' })) as {
      digest: string
    }
    const job = (await service.execute('artifacts.install', {
      plan_digest: plan.digest,
      request_id: 'test-install',
    })) as { id: string }
    expect(job.id).toBe('test-install')
    expect(await service.execute('artifacts.list')).toMatchObject([
      { id: 'test-install', stage: expect.stringMatching(/queued|installing_engine|downloading/) },
    ])
    await expect(
      service.execute('artifacts.install', { plan_digest: 'another-plan', request_id: 'test-install' })
    ).rejects.toThrow('another plan')
    release(new Response(payload, { headers: { 'content-length': String(payload.length) } }))
    let jobs: Array<{ stage: string; error?: string }> = []
    for (let attempt = 0; attempt < 100; attempt++) {
      jobs = (await service.execute('artifacts.list')) as typeof jobs
      if (jobs[0]?.stage === 'ready' || jobs[0]?.stage === 'failed') break
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    expect(jobs[0]).toMatchObject({ stage: 'ready' })
    const reconnected = new WorkspaceService(options)
    await reconnected.execute('artifacts.load', { id: 'test-install' })
    expect(link.calls).toContainEqual(
      expect.objectContaining({
        method: 'PUT',
        path: '/embedding/config',
        body: expect.objectContaining({ enabled: true, model_id: 'tiny' }),
      })
    )
    expect(link.calls).toContainEqual({ method: 'POST', path: '/embedding/load', body: {} })
  })
})

describe('an audio model download', () => {
  const payload = 'small voice model',
    sha256 = createHash('sha256').update(payload).digest('hex')
  const catalog = {
    schema_version: 1,
    models: [
      {
        id: 'voice',
        name: 'Voice',
        description: 'A voice.',
        attribution: 'Powered by Someone',
        mode: 'speech',
        engines: ['audio-cpp'],
        family: 'voice_tts',
        task: 'tts',
        repo: 'owner/voice',
        revision: 'c'.repeat(40),
        quants: [{ id: 'q8', path: 'dir/voice.gguf', filename: 'voice.gguf', bytes: payload.length, sha256 }],
        default_voice: 'vivian',
        controls: ['voice'],
        defaults: { durationSec: 7 },
      },
    ],
  }
  function fixture() {
    const tmp = tmpDataFolder()
    cleanup.push(tmp.cleanup)
    const link = fakeCoreLink()
    link.responses['POST /engine-builds/audio-cpp/catalog'] = { active: { tag: 'v0.9.3' } }
    const request = vi.fn<typeof fetch>(async (input) =>
      String(input).includes('raw.githubusercontent.com')
        ? Response.json(catalog)
        : new Response(payload, { headers: { 'content-length': String(payload.length) } })
    )
    const service = new WorkspaceService({
      paths: tmp.paths,
      link,
      config: defaultConfig(),
      fetch: request,
    })
    return { tmp, link, request, service }
  }
  const plan = (service: WorkspaceService) =>
    service.execute('artifacts.plan', { category: 'audio', model_id: 'voice' }) as Promise<{ digest: string }>

  it('downloads into the audio models folder, then loads through the audio routes with its voice', async () => {
    const { tmp, link, request, service } = fixture()
    const { digest } = await plan(service)
    await service.execute('artifacts.install', { plan_digest: digest, request_id: 'voice-install' })
    await vi.waitFor(async () =>
      expect(await service.execute('artifacts.list')).toMatchObject([{ stage: 'ready' }])
    )
    expect(readFileSync(join(tmp.paths.dataFolder, 'audio', 'models', 'voice.gguf'), 'utf8')).toBe(payload)
    expect(String(request.mock.calls.at(-1)![0])).toBe(
      `https://huggingface.co/owner/voice/resolve/${'c'.repeat(40)}/dir/voice.gguf`
    )
    await service.execute('artifacts.load', { id: 'voice-install' })
    expect(link.calls.at(-1)).toEqual({
      method: 'POST',
      path: '/audio/model/load',
      body: {
        modelId: 'voice:q8',
        displayName: 'Voice',
        mode: 'speech',
        file: 'voice.gguf',
        family: 'voice_tts',
        task: 'tts',
        defaultVoice: 'vivian',
      },
    })
    const snapshot = await service.snapshot()
    expect(snapshot.setups).toMatchObject([
      { plan: { audio: { attribution: 'Powered by Someone', controls: ['voice'] } } },
    ])
  })

  it('gives a job with no length the default of the model on disk', async () => {
    const { link, service } = fixture()
    const { digest } = await plan(service)
    await service.execute('artifacts.install', { plan_digest: digest, request_id: 'voice-install' })
    await vi.waitFor(async () =>
      expect(await service.execute('artifacts.list')).toMatchObject([{ stage: 'ready' }])
    )
    link.responses['GET /audio/status'] = { model: { state: 'loaded', loaded: { modelId: 'voice:q8' } } }
    await service.execute('audio.generate', { mode: 'effects', request: { text: 'A door' } })
    expect(link.calls.at(-1)).toMatchObject({
      path: '/audio/jobs',
      body: { request: { text: 'A door', durationSec: 7 } },
    })
  })

  it('removes the file of a model that is not loaded', async () => {
    const { tmp, service } = fixture()
    const { digest } = await plan(service)
    await service.execute('artifacts.install', { plan_digest: digest, request_id: 'voice-install' })
    await vi.waitFor(async () =>
      expect(await service.execute('artifacts.list')).toMatchObject([{ stage: 'ready' }])
    )
    await service.execute('downloads.remove', { id: 'voice-install', owner: 'artifacts', installed: true })
    expect(existsSync(join(tmp.paths.dataFolder, 'audio', 'models', 'voice.gguf'))).toBe(false)
  })

  it('refuses to delete the model the audio engine has loaded', async () => {
    const { link, service } = fixture()
    const { digest } = await plan(service)
    await service.execute('artifacts.install', { plan_digest: digest, request_id: 'voice-install' })
    await vi.waitFor(async () =>
      expect(await service.execute('artifacts.list')).toMatchObject([{ stage: 'ready' }])
    )
    link.responses['GET /audio/status'] = { model: { state: 'loaded', loaded: { modelId: 'voice:q8' } } }
    await expect(
      service.execute('downloads.remove', { id: 'voice-install', owner: 'artifacts', installed: true })
    ).rejects.toThrow('Unload this model')
  })

  it('downloads nothing on a core without audio', async () => {
    const { link, request, service } = fixture()
    link.responses['GET /audio/status'] = new AtomicCoreError(
      'INVALID_ARGUMENT',
      'No such control route: /audio/status'
    )
    await expect(plan(service)).rejects.toThrow("this server's core has no audio")
    expect(request.mock.calls.some(([url]) => String(url).includes('huggingface'))).toBe(false)
    expect(await service.execute('artifacts.list')).toEqual([])
  })
})
