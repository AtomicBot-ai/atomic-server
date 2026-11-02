import { AtomicCoreError } from '@atomic-chat/core'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { defaultConfig } from '../../config/index.js'
import { WORKSPACE_OPERATIONS } from '../../contract/index.js'
import { coreOperation } from '../core-operations.js'
import { WorkspaceService } from '../index.js'

const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))

const load = {
  modelId: 'a:q8',
  displayName: 'A',
  mode: 'speech',
  file: 'a.gguf',
  family: 'f',
  task: 'tts',
}
const CALLS: Array<[string, Record<string, unknown>, string, string, unknown]> = [
  ['audio.status', {}, 'GET', '/audio/status', undefined],
  ['audio.capabilities', {}, 'GET', '/audio/capabilities', undefined],
  ['audio.files', {}, 'GET', '/audio/model-files', undefined],
  ['audio.gallery', {}, 'GET', '/audio/gallery?offset=0&limit=100', undefined],
  ['audio.configure', { request: { idleUnloadSecs: 60 } }, 'PUT', '/audio/config', { idleUnloadSecs: 60 }],
  ['audio.load', { request: load }, 'POST', '/audio/model/load', load],
  ['audio.unload', {}, 'POST', '/audio/model/unload', {}],
  [
    'audio.generate',
    { mode: 'speech', request: { text: 'Hi' } },
    'POST',
    '/audio/jobs',
    { mode: 'speech', request: { text: 'Hi' } },
  ],
  ['audio.job', { id: 'j1' }, 'GET', '/audio/jobs/j1', undefined],
  ['audio.cancel', { id: 'j1' }, 'POST', '/audio/jobs/j1/cancel', {}],
  ['audio.delete', { id: 'j1' }, 'DELETE', '/audio/gallery/j1', undefined],
]

function service() {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const link = fakeCoreLink()
  const fetch404 = (async () => new Response('{}', { status: 404 })) as typeof fetch
  return {
    link,
    service: new WorkspaceService({ link, paths: tmp.paths, config: defaultConfig(), fetch: fetch404 }),
  }
}

describe('the audio operations', () => {
  it('covers every operation of the registry', () => {
    expect(CALLS.map(([name]) => name).sort()).toEqual(
      WORKSPACE_OPERATIONS.filter((op) => op.group === 'audio')
        .map((op) => op.name)
        .sort()
    )
  })

  it.each(CALLS)('%s calls the core', async (name, input, method, path, body) => {
    const { link, service: workspace } = service()
    await workspace.execute(name, input)
    expect(link.calls.at(-1)).toEqual({ method, path, body })
  })

  it.each(CALLS)('%s preserves the core error', async (name, input) => {
    const link = fakeCoreLink()
    const error = new AtomicCoreError('INTERNAL_ERROR', 'Audio service unavailable')
    link.request = async () => {
      throw error
    }
    await expect(coreOperation(link, name, input)).rejects.toBe(error)
  })

  it('refuses a generation without text, or in an unknown mode', async () => {
    const { service: workspace } = service()
    await expect(workspace.execute('audio.generate', { mode: 'speech', request: {} })).rejects.toThrow(
      'request.text is required'
    )
    await expect(
      workspace.execute('audio.generate', { mode: 'singing', request: { text: 'a' } })
    ).rejects.toThrow('Choose speech, music, effects')
  })

  it('gives back the job as the core wrote it', async () => {
    const { link, service: workspace } = service()
    const job = { id: 'j', state: 'queued', request: { text: 'token', options: { token: 1 } } }
    link.responses['POST /audio/jobs'] = job
    await expect(
      workspace.execute('audio.generate', { mode: 'speech', request: { text: 'token' } })
    ).resolves.toEqual(job)
  })
})

describe('a generation with no length', () => {
  it('still names one, whatever the model', async () => {
    const { link, service: workspace } = service()
    await workspace.execute('audio.generate', { mode: 'effects', request: { text: 'a door' } })
    const job = link.calls.find((call) => call.path === '/audio/jobs')
    expect(job?.body).toMatchObject({ request: { text: 'a door', durationSec: expect.any(Number) } })
  })
})
