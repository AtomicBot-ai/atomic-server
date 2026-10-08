import { describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../config/index.js'
import { requestRow, startApi } from './operations.js'
describe('shared API operations', () => {
  it('requires a key for remote access and preserves the requested port', async () => {
    const link = fakeCoreLink(),
      config = defaultConfig()
    config.api.requireKey = false
    config.api.host = '0.0.0.0'
    await expect(startApi(link, config)).rejects.toThrow('ATC_API_KEY')
    expect(link.calls).toEqual([])
    await startApi(link, config, 'local-key')
    expect(link.calls[0]).toMatchObject({
      path: '/server/start',
      body: { port: 1337, api_key: 'local-key', fallback_port: false },
    })
  })
  it('accepts only finished request metadata and never retains prompt bodies', () => {
    expect(requestRow({ phase: 'started', id: '1' })).toBeUndefined()
    expect(
      requestRow({
        phase: 'finished',
        id: '1',
        observation: { model_id: 'm', status: 200, prompt: 'private' },
        finish: { duration_ms: 23, total_tokens: 8 },
        finished_at_ms: 99,
      })
    ).toEqual({
      id: '1',
      model: 'm',
      endpoint: '/v1',
      status: '200',
      duration: 23,
      firstToken: null,
      tokens: 8,
      time: 99,
    })
  })
})
