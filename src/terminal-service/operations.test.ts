import { describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../config/index.js'
import { requestRow, startApi } from './operations.js'
describe('shared API operations', () => {
  it('starts only with a key from the keyring, on any host, and keeps the requested port', async () => {
    const link = fakeCoreLink(),
      config = defaultConfig()
    config.api.host = '0.0.0.0'
    await expect(startApi(link, config, '')).rejects.toThrow('keyring is empty')
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

describe('startApi and a port another program holds', () => {
  it('refuses before the core binds, naming the port', async () => {
    const link = fakeCoreLink()
    await expect(
      startApi(link, defaultConfig(), 'k', { probePort: async () => 'busy' })
    ).rejects.toMatchObject({ code: 'ATC_PORT_BUSY', message: expect.stringContaining('1337') })
    expect(link.calls.find((c) => c.path === '/server/start')).toBeUndefined()
  })

  it('does not probe the listener the API already holds', async () => {
    const link = fakeCoreLink()
    let probed = false
    await startApi(link, defaultConfig(), 'k', {
      probePort: async () => ((probed = true), 'busy'),
      status: { running: true, host: '127.0.0.1', port: 1337 },
    })
    expect(probed).toBe(false)
    expect(link.calls.find((c) => c.path === '/server/start')).toBeDefined()
  })

  it('probes the overriding listener, not the configured one', async () => {
    const link = fakeCoreLink()
    const seen: string[] = []
    await startApi(link, defaultConfig(), 'k', {
      request: { host: '0.0.0.0', port: 9000 },
      probePort: async (host, port) => (seen.push(`${host}:${port}`), 'free'),
    })
    expect(seen).toEqual(['0.0.0.0:9000'])
  })
})
