import { describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { withAudioDuration } from './audio-duration.js'

const details = { mode: 'effects', attribution: null, controls: [], defaults: {}, ranges: {} }
const download = (model_id: string, defaults: Record<string, number>) => ({
  plan: { model_id, audio: { ...details, defaults } },
})
function link(modelId?: string) {
  const fake = fakeCoreLink()
  fake.responses['GET /audio/status'] = {
    model: { state: modelId ? 'loaded' : 'unloaded', loaded: modelId ? { modelId } : null },
  }
  return fake
}
const downloads = async () => [download('sfx:q8_0', { durationSec: 5 }), download('song:q8_0', {})]

describe('the length of a music or effects job', () => {
  it('takes the default the catalog gave the loaded model, from its download', async () => {
    const request = { text: 'a door' }
    await expect(
      withAudioDuration(link('sfx:q8_0'), downloads, { mode: 'effects', request })
    ).resolves.toEqual({ text: 'a door', durationSec: 5 })
  })

  it.each([
    ['a model with no default', 'song:q8_0'],
    ['a model loaded by hand', 'mine'],
    ['no model at all', undefined],
  ])('still names one for %s', async (_name, model) => {
    const { durationSec } = await withAudioDuration(link(model), downloads, {
      mode: 'music',
      request: { text: 'a song' },
    })
    expect(durationSec).toEqual(expect.any(Number))
  })

  it('keeps the length a request names, and asks the core nothing', async () => {
    const fake = link('sfx:q8_0')
    const request = { text: 'a song', durationSec: 42 }
    await expect(withAudioDuration(fake, downloads, { mode: 'music', request })).resolves.toEqual(request)
    expect(fake.calls).toEqual([])
  })

  it('adds nothing to speech', async () => {
    const request = { text: 'Hello' }
    await expect(
      withAudioDuration(link('sfx:q8_0'), downloads, { mode: 'speech', request })
    ).resolves.toEqual(request)
  })
})
