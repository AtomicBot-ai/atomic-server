/** Audio cancellation retains the core's selection even across a workspace-service restart. */
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { defaultConfig } from '../../src/config/index.js'
import { writeDocument } from '../../src/terminal-data/index.js'
import { WorkspaceService } from '../../src/workspace-service/index.js'
import { fakeCoreLink } from '../helpers/fake-core-link.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

it('uses the downloaded duration again when the stopped audio engine resumes after reconnecting', async () => {
  const tmp = tmpDataFolder()
  const link = fakeCoreLink()
  const modelId = 'stable-audio-3-small-sfx:q8_0'
  const selected = { modelId, mode: 'effects' }
  let resident = true
  link.responses['GET /audio/status'] = () => ({
    model: { state: resident ? 'loaded' : 'unloaded', loaded: resident ? selected : null },
    activeJob: null,
  })
  link.responses['GET /audio/capabilities'] = selected
  link.responses['POST /audio/jobs'] = () => {
    resident = true
    return { id: 'clip', state: 'queued' }
  }
  link.responses['POST /audio/jobs/clip/cancel'] = () => {
    resident = false
    return { cancelled: true, serverStopped: true }
  }
  const workspace = () =>
    new WorkspaceService({
      link,
      paths: tmp.paths,
      config: defaultConfig(),
      fetch: (async () => Response.json({}, { status: 404 })) as typeof fetch,
    })
  try {
    await writeDocument(join(tmp.paths.atcDir, 'media-installations', 'download.json'), {
      id: 'download',
      stage: 'ready',
      plan: {
        category: 'audio',
        engine: 'audio-cpp',
        model_id: modelId,
        audio: { mode: 'effects', defaults: { durationSec: 5 } },
      },
    })
    const first = workspace()
    const input = () => ({ mode: 'effects', request: { text: 'A soft click.' } })
    await first.execute('audio.generate', input())
    await first.execute('audio.cancel', { id: 'clip' })
    // No client-side memory of the loaded model is available in the new service.
    await workspace().execute('audio.generate', input())
    expect(link.calls.filter((call) => call.path === '/audio/jobs').map((call) => call.body)).toEqual([
      { mode: 'effects', request: { text: 'A soft click.', durationSec: 5 } },
      { mode: 'effects', request: { text: 'A soft click.', durationSec: 5 } },
    ])
    expect(link.calls).toContainEqual({ method: 'GET', path: '/audio/capabilities', body: undefined })
  } finally {
    tmp.cleanup()
  }
})
