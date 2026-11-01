import { AtomicCoreError } from '@atomic-chat/core'
import { describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { audioRequest, requireAudioCore } from './audio-core.js'

const noRoute = new AtomicCoreError('INVALID_ARGUMENT', 'No such control route: /audio/status')

describe('the core audio routes', () => {
  it('passes a call through', async () => {
    const link = fakeCoreLink()
    link.responses['GET /audio/status'] = { outputDir: '/audios' }
    await expect(audioRequest(link, 'GET', '/audio/status')).resolves.toEqual({ outputDir: '/audios' })
  })

  it('says plainly that a core without the routes has no audio', async () => {
    const link = fakeCoreLink()
    link.responses['GET /audio/status'] = noRoute
    const failure = audioRequest(link, 'GET', '/audio/status')
    await expect(failure).rejects.toMatchObject({ code: 'ATC_NOT_IMPLEMENTED' })
    await expect(failure).rejects.toThrow("this server's core has no audio")
    await expect(requireAudioCore(link)).rejects.toThrow("this server's core has no audio")
  })

  it('leaves the errors of a core with audio alone', async () => {
    const link = fakeCoreLink()
    const busy = new AtomicCoreError('INVALID_ARGUMENT', 'text is required')
    link.responses['POST /audio/jobs'] = busy
    await expect(audioRequest(link, 'POST', '/audio/jobs', {})).rejects.toBe(busy)
  })
})
