import { describe, expect, it } from 'vitest'
import { mediaDefaults, mediaJob } from './media-data'
describe('Core media responses', () => {
  it('unwraps job status and preserves completed outputs', () => {
    expect(mediaJob({ job: { id: 'j', state: 'completed', outputs: [{ id: 'image' }] } })).toEqual({
      id: 'j',
      state: 'completed',
      outputs: [{ id: 'image' }],
    })
    expect(mediaJob({ job: null })).toEqual({})
  })
  it.each(['image', 'video'])('uses shared %s draft defaults before model capabilities arrive', (task) => {
    expect(mediaDefaults({}, task)).toMatchObject({
      prompt: '',
      workflow: 'create',
      width: 512,
      height: 512,
      steps: 20,
      cfgScale: 7,
    })
    if (task === 'video') expect(mediaDefaults({}, task)).not.toHaveProperty('batchSize')
  })
  it('uses family video defaults without sending nested load-time settings', () => {
    const defaults = mediaDefaults(
      {
        defaults: { width: 768, height: 512, steps: 12, cfgScale: 1, video: { fps: 24, frames: 121 } },
        fps: 24,
        frames: { default: 121 },
      },
      'video'
    )
    expect(defaults).toEqual({
      prompt: '',
      workflow: 'create',
      width: 768,
      height: 512,
      steps: 12,
      cfgScale: 1,
      frames: 121,
      fps: 24,
    })
    expect(defaults).not.toHaveProperty('batchSize')
    expect(defaults).not.toHaveProperty('video')
  })
})
